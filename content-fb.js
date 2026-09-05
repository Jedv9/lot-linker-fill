// Lot Linker Fill — content script (fill only, never Post)
function isMarketplacePath() {
  return /marketplace/i.test(location.pathname + location.href);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setNativeValue(el, value) {
  if (!el || value == null || value === "") return false;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillContentEditable(el, value) {
  el.focus();
  el.textContent = String(value);
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

function labelText(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.placeholder,
    el.name,
    el.id,
    el.getAttribute("aria-labelledby") &&
      document.getElementById(el.getAttribute("aria-labelledby"))?.textContent,
  ];
  const label = el.closest("label");
  if (label) bits.push(label.textContent);
  // nearby heading / span text
  const wrap = el.closest("div");
  if (wrap) {
    const lab = wrap.querySelector("label, span, div");
    if (lab && lab !== el) bits.push(lab.textContent);
  }
  return (bits.filter(Boolean).join(" ") || "").toLowerCase().replace(/\s+/g, " ");
}

function allInputs() {
  return [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true], [role=textbox]"
    ),
  ];
}

function findField(matchers, { exclude = [] } = {}) {
  for (const el of allInputs()) {
    const lab = labelText(el);
    if (exclude.some((x) => x.test(lab))) continue;
    if (matchers.some((m) => m.test(lab))) return el;
  }
  return null;
}

function mapBodyStyle(s) {
  const t = (s || "").toLowerCase();
  if (/sedan/.test(t)) return "Sedan";
  if (/suv|crossover|sport utility/.test(t)) return "SUV";
  if (/truck|pickup/.test(t)) return "Truck";
  if (/coupe/.test(t)) return "Coupe";
  if (/hatch/.test(t)) return "Hatchback";
  if (/van|minivan/.test(t)) return "Van";
  if (/wagon/.test(t)) return "Wagon";
  if (/convert/.test(t)) return "Convertible";
  return s || "";
}

function mapTransmission(s) {
  const t = (s || "").toLowerCase();
  if (/manual/.test(t)) return "Manual transmission";
  // CVT / Xtronic / automatic → FB "Automatic transmission"
  return "Automatic transmission";
}

function mapFuel(s) {
  const t = (s || "").toLowerCase();
  if (/diesel/.test(t)) return "Diesel";
  if (/electric|ev\b/.test(t)) return "Electric";
  if (/hybrid/.test(t)) return "Hybrid";
  if (/plug/.test(t)) return "Plugin hybrid";
  return "Gasoline";
}

function mapCondition(s) {
  const t = (s || "").toLowerCase();
  if (t === "new") return "Excellent"; // FB vehicle condition scale; NEW units still use condition dropdown
  if (/excellent/.test(t)) return "Excellent";
  if (/very good|like new/.test(t)) return "Very good";
  if (/good/.test(t)) return "Good";
  if (/fair|poor/.test(t)) return "Fair";
  return "Excellent";
}

function mapColor(s) {
  let t = (s || "").replace(/^int\s*/i, "").trim();
  // strip marketing color names to base if possible
  const base = [
    "Black",
    "White",
    "Gray",
    "Grey",
    "Silver",
    "Red",
    "Blue",
    "Green",
    "Brown",
    "Beige",
    "Gold",
    "Orange",
    "Yellow",
    "Purple",
    "Pink",
    "Charcoal",
  ];
  for (const c of base) {
    if (new RegExp(c, "i").test(t)) return c === "Grey" ? "Gray" : c;
  }
  // Pearl White etc.
  if (/pearl\s*white|white/i.test(t)) return "White";
  if (/super\s*black|black/i.test(t)) return "Black";
  if (/sky\s*pearl|gray|grey/i.test(t)) return "Gray";
  return t;
}

function mileageForFacebook(pack) {
  let n = Number(String(pack.mileage ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) n = 0;
  // FB: 300 .. 1,000,000. NEW demo miles under 300 fail validation.
  if (n < 300) n = 300;
  if (n > 1000000) n = 1000000;
  return String(n);
}

async function openAndPick(matchers, optionText) {
  if (!optionText) return false;
  const el = findField(matchers);
  if (!el) {
    // try combobox buttons
    const boxes = [...document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"]')];
    let target = null;
    for (const b of boxes) {
      const lab = labelText(b);
      if (matchers.some((m) => m.test(lab))) {
        target = b;
        break;
      }
    }
    if (!target) return false;
    target.click();
  } else {
    el.click();
    el.focus();
  }
  await sleep(200);
  const want = String(optionText).toLowerCase();
  const opts = [
    ...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], li[role="option"]'),
  ];
  for (const o of opts) {
    const t = (o.textContent || "").trim().toLowerCase();
    if (t === want || t.includes(want)) {
      o.click();
      await sleep(120);
      return true;
    }
  }
  // typeahead: type into focused input
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.getAttribute("role") === "combobox")) {
    setNativeValue(active, optionText);
    await sleep(250);
    const opts2 = [...document.querySelectorAll('[role="option"]')];
    for (const o of opts2) {
      const t = (o.textContent || "").trim().toLowerCase();
      if (t === want || t.startsWith(want) || t.includes(want)) {
        o.click();
        return true;
      }
    }
  }
  return false;
}

function clickCheckboxByText(substr) {
  const want = substr.toLowerCase();
  const nodes = [...document.querySelectorAll("div, span, label")];
  for (const n of nodes) {
    const t = (n.textContent || "").trim().toLowerCase();
    if (t.startsWith(want) || t.includes(want)) {
      // find checkbox nearby
      const row = n.closest("div");
      const box =
        row?.querySelector('[role="checkbox"]') ||
        row?.querySelector('input[type="checkbox"]') ||
        n.parentElement?.querySelector('[role="checkbox"]');
      if (box) {
        const checked =
          box.getAttribute("aria-checked") === "true" || box.checked === true;
        if (!checked) box.click();
        return true;
      }
      // click the row toggle on the right
      if (row) {
        row.click();
        return true;
      }
    }
  }
  return false;
}

function fillText(matchers, value, exclude) {
  if (value == null || value === "") return false;
  const el = findField(matchers, { exclude });
  if (!el) return false;
  if (el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox") {
    return fillContentEditable(el, value);
  }
  return setNativeValue(el, value);
}

async function fillPack(pack) {
  const filled = [];
  const missed = [];
  const mark = (key, ok) => (ok ? filled : missed).push(key);

  // 1) VIN first — FB may auto-fill year/make/model (often wrong). We overwrite after.
  mark("vin", fillText([/\bvin\b/, /vehicle identification/], pack.vin));
  await sleep(600);

  // 2) Vehicle type
  mark("vehicleType", await openAndPick([/vehicle type/, /listing type/], "Car/Truck"));

  // 3) Location
  mark(
    "location",
    fillText([/\blocation\b/, /city/, /town/], "Oconomowoc") ||
      fillText([/\bzip\b/, /postal/], pack.zip || "53066")
  );

  // 4) Year / Make / Model — overwrite VIN decode mistakes
  mark("year", await openAndPick([/\byear\b/], pack.year) || fillText([/\byear\b/], pack.year));
  mark("make", await openAndPick([/\bmake\b/, /manufacturer/], pack.make) || fillText([/\bmake\b/], pack.make));
  await sleep(200);
  mark(
    "model",
    (await openAndPick([/\bmodel\b/], pack.model)) || fillText([/\bmodel\b/], pack.model)
  );

  // 5) Mileage — FB requires 300..1,000,000
  const miles = mileageForFacebook(pack);
  mark("mileage", fillText([/mileage/, /odometer/, /\bmiles\b/], miles));

  // 6) Price (digits only often preferred; keep as-is number)
  mark("price", fillText([/^price$/, /\bprice\b/, /asking/], pack.price, [/mileage/]));

  // 7) Appearance
  mark("bodyStyle", await openAndPick([/body style/, /body type/], mapBodyStyle(pack.bodyStyle)));
  const extPick = pack.exteriorFb || mapColor(pack.exterior);
  const intPick = pack.interiorFb || mapColor(pack.interiorName || pack.interior);
  mark("exterior", await openAndPick([/exterior color/, /exterior/], extPick));
  mark("interior", await openAndPick([/interior color/, /interior/], intPick));

  // 8) Details
  mark("cleanTitle", clickCheckboxByText("this vehicle has a clean title"));
  mark(
    "condition",
    await openAndPick([/vehicle condition/, /^condition$/], mapCondition(pack.condition))
  );
  mark("fuel", await openAndPick([/fuel type/, /\bfuel\b/], mapFuel(pack.fuel)));
  mark(
    "transmission",
    await openAndPick([/transmission/], mapTransmission(pack.transmission))
  );

  // 9) Description = BODY (not title). Note real odometer if FB mileage was floored to 300+.
  let desc = pack.body || "";
  const odo = Number(pack.odometerMiles ?? pack.mileage ?? 0);
  if (Number.isFinite(odo) && odo < 300) {
    const tag = (pack.condition || "").toUpperCase() === "NEW"
      ? `New vehicle · ${odo} miles on odometer.`
      : `Odometer ${odo} miles.`;
    if (!desc.includes("miles on odometer") && !desc.includes(`Odometer ${odo}`)) {
      desc = desc ? `${tag} ${desc}` : tag;
    }
  }
  mark(
    "description",
    fillText([/^description$/, /more details/, /about this vehicle/, /tell buyers/], desc, [
      /title/,
      /vin/,
    ])
  );

  return {
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    notes:
      Number(pack.mileage) < 300
        ? `Mileage set to ${miles} (FB rejects under 300). Photos still manual.`
        : "Photos still manual.",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "LOT_LINKER_FILL") return;
  if (!isMarketplacePath()) {
    sendResponse({ ok: false, error: "Open a Facebook Marketplace listing tab first" });
    return true;
  }
  (async () => {
    try {
      const result = await fillPack(msg.pack || {});
      sendResponse({ ok: true, ...result });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
