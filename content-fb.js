// Lot Linker Fill — navigate to create/vehicle if needed, Vehicle type first, then the rest.
// Never VIN. Never clean-title checkbox. Never vehicle condition. Never Post.
// Never dispatch Escape on document (that closes FB's create dialog → home).
function fbNav() {
  return typeof LotLinkerFbNav !== "undefined" ? LotLinkerFbNav : null;
}

function isMarketplacePath() {
  return /marketplace/i.test(location.pathname + location.href);
}

function isCreateVehicleListingPath() {
  const nav = fbNav();
  if (nav?.isCreateVehicleListingUrl) return nav.isCreateVehicleListingUrl(location.href);
  return /\/marketplace\/create\/vehicle/i.test(location.pathname + location.href);
}

function isFacebookHomePath() {
  const nav = fbNav();
  if (nav?.isFacebookHomeUrl) return nav.isFacebookHomeUrl(location.href);
  return !/marketplace/i.test(location.pathname) && /^\/$|^\/home\.php$/i.test(location.pathname || "");
}

const DESC_MATCHERS = [
  /^description$/,
  /\bdescription\b/,
  /\bdescribe\b/,
  /more details/,
  /about (this|your) vehicle/,
  /tell buyers/,
  /buyers about/,
  /what makes your/,
];

const DESC_EXCLUDE = [
  /^model$/,
  /\bvehicle model\b/,
  /\byear\b/,
  /\bmake\b/,
  /\bmileage\b/,
  /\bodometer\b/,
  /\bvin\b/,
  /clean title/,
  /title status/,
  /listing title/,
  /item title/,
];

const DESC_ATTR_SELECTORS = [
  '[aria-label="Description" i]',
  '[aria-label*="Description" i]',
  '[aria-placeholder="Description" i]',
  '[aria-placeholder*="Description" i]',
  '[placeholder*="Description" i]',
  '[placeholder*="Describe" i]',
  '[aria-label*="Describe" i]',
  '[aria-label*="Tell buyers" i]',
  '[aria-placeholder*="Tell buyers" i]',
  '[aria-label*="More details" i]',
  '[aria-label*="about your vehicle" i]',
  '[aria-label*="about this vehicle" i]',
  '[data-placeholder*="Description" i]',
];

function setNativeValue(el, value) {
  if (!el || value == null) return false;
  if (isOffLimitsControl(el)) return false;
  const next = String(value);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc =
    Object.getOwnPropertyDescriptor(proto, "value") ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const last = el.value;
  try {
    el._valueTracker?.setValue(last);
  } catch {
    /* ignore */
  }
  desc?.set?.call(el, next);
  try {
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        data: next,
        inputType: "insertFromPaste",
      })
    );
  } catch {
    /* older engines */
  }
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, composed: true, data: next, inputType: "insertFromPaste" })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return String(el.value ?? "").replace(/\r\n/g, "\n") === next.replace(/\r\n/g, "\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlFromMultiline(text) {
  return String(text)
    .split("\n")
    .map((line) => (line ? escapeHtml(line) : ""))
    .join("<br>");
}

function readFilled(el) {
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value || "";
  return el.innerText || el.textContent || "";
}

function looksFilled(el, text) {
  const got = readFilled(el).replace(/\r\n/g, "\n");
  const exp = String(text).replace(/\r\n/g, "\n");
  if (!got) return false;
  return got === exp || got.includes(exp.slice(0, Math.min(24, exp.length)));
}

function scrollElIntoView(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  } catch {
    try {
      el.scrollIntoView();
    } catch {
      /* ignore */
    }
  }
  let p = el.parentElement;
  for (let i = 0; i < 8 && p; i++) {
    try {
      const st = getComputedStyle(p);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll" || p.scrollHeight > p.clientHeight + 40) && p.scrollHeight > p.clientHeight) {
        const r = el.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        p.scrollTop += r.top - pr.top - p.clientHeight / 3;
      }
    } catch {
      /* ignore */
    }
    p = p.parentElement;
  }
}

function resolveEditable(el) {
  if (!el) return el;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el;
  const innerTa = el.querySelector?.("textarea");
  if (innerTa && isDisplayed(innerTa)) return innerTa;
  if (el.isContentEditable) return el;
  const innerCe = el.querySelector?.("[contenteditable]:not([contenteditable=false])");
  if (innerCe) return innerCe;
  if (innerTa) return innerTa;
  return el;
}

function fillMultiline(el, value) {
  if (isOffLimitsControl(el)) return false;
  const text = String(value);
  const target = resolveEditable(el) || el;
  if (isOffLimitsControl(target)) return false;
  scrollElIntoView(target);
  try {
    target.focus();
  } catch {
    /* ignore */
  }
  try {
    target.click();
  } catch {
    /* ignore */
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (setNativeValue(target, text) && looksFilled(target, text)) return true;
  }

  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      target.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          data: text,
          inputType: "insertFromPaste",
        })
      );
    } catch {
      /* ignore */
    }
    if (document.execCommand("insertText", false, text)) {
      target.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: text })
      );
      if (looksFilled(target, text)) return true;
    }
  } catch {
    /* fall through */
  }

  target.innerHTML = htmlFromMultiline(text);
  try {
    target.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        data: text,
        inputType: "insertFromPaste",
      })
    );
  } catch {
    /* ignore */
  }
  target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: text }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return looksFilled(target, text) || Boolean(readFilled(target).trim());
}

function shortText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isControl(node) {
  return node?.matches?.(
    "input, textarea, select, [contenteditable], [role=textbox], [role=combobox]"
  );
}

function collectNearbyLabel(node, bits) {
  if (!node || isControl(node)) return;
  const lab = node.querySelector?.(":scope > label, :scope > span, :scope > [role=label], :scope > p, :scope > legend");
  if (lab && !lab.querySelector("input, textarea, [contenteditable], [role=textbox]")) {
    const t = shortText(lab.textContent);
    if (t && t.length < 80) bits.push(t);
  }
}

function labelText(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("aria-placeholder"),
    el.getAttribute("data-placeholder"),
    el.placeholder,
    el.name,
    el.id,
  ];
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const n = document.getElementById(id);
      if (n) bits.push(n.textContent);
    }
  }
  if (el.id) {
    try {
      const forLab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLab) bits.push(forLab.textContent);
    } catch {
      /* ignore */
    }
  }
  const closestLabel = el.closest("label");
  if (closestLabel) {
    const t = shortText(closestLabel.textContent);
    if (t && t.length < 80) bits.push(t);
    else {
      const inner = [...closestLabel.querySelectorAll("span, div, p")].find((n) => {
        const s = shortText(n.textContent);
        return s && s.length < 40 && !n.contains(el) && !n.querySelector("input, textarea, [role=textbox]");
      });
      if (inner) bits.push(inner.textContent);
    }
  }

  const sib = el.previousElementSibling;
  if (sib && sib.matches("label, span, div, p, legend") && !isControl(sib) && !sib.querySelector("input, textarea, [contenteditable], [role=textbox]")) {
    const t = shortText(sib.textContent);
    if (t && t.length < 80) bits.push(t);
  }

  let node = el.parentElement;
  for (let depth = 0; depth < 8 && node; depth++) {
    bits.push(node.getAttribute("aria-label"));
    bits.push(node.getAttribute("aria-placeholder"));
    bits.push(node.getAttribute("data-placeholder"));
    bits.push(node.getAttribute("placeholder"));
    collectNearbyLabel(node, bits);
    const sibLab = node.previousElementSibling;
    if (
      sibLab &&
      sibLab.matches("label, span, div, p, legend, [role=label]") &&
      !isControl(sibLab) &&
      !sibLab.querySelector("input, textarea, [contenteditable], [role=textbox]")
    ) {
      const t = shortText(sibLab.textContent);
      if (t && t.length < 80) bits.push(t);
    }
    node = node.parentElement;
  }
  return bits.filter(Boolean).map(shortText).filter(Boolean).join(" ").toLowerCase();
}

function isProtectedLabel(lab) {
  // Description must never land on these spec controls.
  return (
    /\byear\b/.test(lab) ||
    /\bmake\b/.test(lab) ||
    /\bmileage\b/.test(lab) ||
    /\bodometer\b/.test(lab) ||
    /\bvin\b/.test(lab) ||
    /vehicle identification/.test(lab) ||
    /body style/.test(lab) ||
    /\bexterior\b/.test(lab) ||
    /\binterior\b/.test(lab) ||
    /\bfuel\b/.test(lab) ||
    /clean title/.test(lab) ||
    /title status/.test(lab) ||
    /vehicle condition/.test(lab) ||
    /vehicle type/.test(lab)
  );
}

function isVinLabel(lab) {
  const t = String(lab || "").toLowerCase();
  return /\bvin\b/.test(t) || /vehicle identification/.test(t);
}

/** Hard stop: never write the Marketplace VIN field. */
function isVinControl(el) {
  if (!el) return false;
  if (isVinLabel(ownLabel(el))) return true;
  const bits = [el.name, el.id, el.getAttribute?.("autocomplete"), el.getAttribute?.("aria-label")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bvin\b/.test(bits) || /vehicle identification/.test(bits);
}

function isOffLimitsLabel(lab) {
  const t = String(lab || "").toLowerCase();
  return (
    isVinLabel(t) ||
    /clean title/.test(t) ||
    /this vehicle has a clean title/.test(t) ||
    /title status/.test(t) ||
    /vehicle condition/.test(t) ||
    /^(new or used|used or new|condition)$/.test(t)
  );
}

function isOffLimitsControl(el) {
  if (!el) return false;
  if (isVinControl(el)) return true;
  return isOffLimitsLabel(ownLabel(el));
}

function ownLabel(el) {
  if (!el) return "";
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("aria-placeholder"),
    el.getAttribute("data-placeholder"),
    el.placeholder,
    el.name,
    el.id && el.id.length < 24 ? el.id : "",
  ];
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const n = document.getElementById(id);
      if (n) bits.push(n.textContent);
    }
  }
  if (el.id) {
    try {
      const forLab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLab) bits.push(forLab.textContent);
    } catch {
      /* ignore */
    }
  }
  const closestLabel = el.closest("label");
  if (closestLabel) {
    const t = shortText(closestLabel.textContent);
    if (t && t.length < 48) bits.push(t);
  }
  const prev = el.previousElementSibling;
  if (prev && !isControl(prev) && !prev.querySelector?.("input, textarea, [contenteditable], [role=textbox], [role=combobox]")) {
    const t = shortText(prev.textContent);
    if (t && t.length < 40) bits.push(t);
  }
  const caption = shortChoiceCaption(el);
  if (caption) bits.push(caption);
  const parent = el.parentElement;
  if (parent) {
    const pLab = parent.getAttribute("aria-label");
    if (pLab) bits.push(pLab);
    const pPrev = parent.previousElementSibling;
    if (
      pPrev &&
      pPrev.matches?.("label, span, div, p, legend, [role=label]") &&
      !isControl(pPrev) &&
      !pPrev.querySelector?.("input, textarea, [contenteditable], [role=textbox], [role=combobox]")
    ) {
      const t = shortText(pPrev.textContent);
      if (t && t.length < 40) bits.push(t);
    }
    const kid = [...parent.children].find((n) => {
      if (n === el || isControl(n)) return false;
      const t = shortText(n.textContent);
      return t && t.length < 32 && !n.querySelector("input, textarea, [role=textbox], [role=combobox]");
    });
    if (kid) bits.push(kid.textContent);
  }
  return bits.filter(Boolean).map(shortText).filter(Boolean).join(" ").toLowerCase();
}

/** Placeholder text inside a FB combobox/button ("Year") — not a separate aria-label. */
function shortChoiceCaption(el) {
  if (!el) return "";
  if (el.querySelector?.("[role=option], [role=listbox]")) return "";
  const raw = shortText(el.textContent);
  if (raw && raw.length < 36) return raw;
  return "";
}

/** Skip only when the label is a *different* field — not a grouped "Year, make, model" heading. */
function isExcludedLabel(lab, matchers, exclude) {
  const t = String(lab || "");
  if (!t) return false;
  if (matchers && matchers.some((m) => m.test(t))) return false;
  return (exclude || []).some((x) => x.test(t));
}

function isBlankPackValue(v) {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  return !s || /^(\[need\]|n\/?a|unknown|tbd|none|-)$/i.test(s);
}

function priceDigits(pack) {
  const n = Number(String(pack?.price ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n));
}

function mileageDigits(pack) {
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.marketplaceMileage) {
    return LotLinkerListing.marketplaceMileage(pack);
  }
  const raw =
    pack?.odometerMiles != null && pack.odometerMiles !== "" ? pack.odometerMiles : pack?.mileage;
  const n = Number(String(raw ?? "").replace(/[^\d]/g, ""));
  const miles = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  return String(Math.max(300, miles));
}

function bodyStyleCandidates(pack) {
  if (isBlankPackValue(pack?.bodyStyle)) return [];
  const t = String(pack.bodyStyle).toLowerCase();
  if (/sedan/.test(t)) return ["Sedan"];
  if (/suv|sport utility|crossover/.test(t)) return ["SUV"];
  if (/hatch/.test(t)) return ["Hatchback"];
  if (/minivan/.test(t)) return ["Minivan"];
  if (/\bvan\b/.test(t)) return ["Minivan", "Van"];
  if (/coupe/.test(t)) return ["Coupe"];
  if (/convertible/.test(t)) return ["Convertible"];
  if (/wagon/.test(t)) return ["Wagon"];
  if (/crew|cab|supercrew|pickup|truck/.test(t)) return ["Truck", "Pickup", "Pickup truck"];
  const cleaned = String(pack.bodyStyle).replace(/\s+\dD$/i, "").trim();
  return cleaned ? [cleaned] : [];
}

function fbColorHint(pack, which) {
  const raw = which === "interior" ? pack?.interiorFb : pack?.exteriorFb;
  if (isBlankPackValue(raw)) return [];
  return [String(raw).trim()];
}

function mergedColorCandidates(pack, which) {
  const raw = which === "interior" ? pack?.interior : pack?.exterior;
  return [...new Set([...fbColorHint(pack, which), ...colorCandidates(raw)])];
}

function yearCandidates(pack) {
  const y = isBlankPackValue(pack?.year) ? "" : String(pack.year).trim();
  return y ? [y] : [];
}

function closestYearValue(want, available) {
  const n = Number(String(want).replace(/[^\d]/g, ""));
  const years = (available || []).map((v) => String(v).trim()).filter((v) => /^\d{4}$/.test(v));
  if (!Number.isFinite(n) || !years.length) return "";
  let best = years[0];
  let dist = Infinity;
  for (const y of years) {
    const d = Math.abs(Number(y) - n);
    if (d < dist) {
      dist = d;
      best = y;
    }
  }
  // Only snap to an adjacent year (2027 pack vs FB max 2026). Never grab
  // the edge of a virtualized window (2012 must not become 2017).
  return dist <= 1 ? best : "";
}

function colorCandidates(raw) {
  if (isBlankPackValue(raw)) return [];
  const s = String(raw).toLowerCase();
  const palette = [
    ["charcoal", ["Charcoal", "Grey", "Gray", "Black"]],
    ["graphite", ["Grey", "Gray", "Black"]],
    ["ebony", ["Black"]],
    ["onyx", ["Black"]],
    ["sport", ["Black", "Charcoal", "Grey", "Gray"]],
    ["burgundy", ["Burgundy", "Red"]],
    ["maroon", ["Burgundy", "Red"]],
    ["ivory", ["Ivory", "White"]],
    ["cream", ["Cream", "Beige", "White"]],
    ["beige", ["Beige", "Tan"]],
    ["almond", ["Beige", "Tan"]],
    ["parchment", ["Beige", "Tan", "White"]],
    ["camel", ["Tan", "Beige"]],
    ["chestnut", ["Brown"]],
    ["pecan", ["Brown"]],
    ["bronze", ["Bronze", "Brown"]],
    ["platinum", ["Silver", "Grey", "Gray"]],
    ["steel", ["Grey", "Gray", "Silver"]],
    ["denim", ["Blue"]],
    ["silver", ["Silver"]],
    ["white", ["White"]],
    ["black", ["Black"]],
    ["navy", ["Blue"]],
    ["blue", ["Blue"]],
    ["green", ["Green"]],
    ["brown", ["Brown"]],
    ["gold", ["Gold"]],
    ["yellow", ["Yellow"]],
    ["orange", ["Orange"]],
    ["purple", ["Purple"]],
    ["pink", ["Pink"]],
    ["tan", ["Tan", "Beige"]],
    ["gray", ["Grey", "Gray"]],
    ["grey", ["Grey", "Gray"]],
    ["red", ["Red"]],
  ];
  for (const [word, aliases] of palette) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return aliases;
  }
  const cleaned = String(raw).replace(/\s+\dD$/i, "").trim();
  return cleaned ? [cleaned] : [];
}

function fuelCandidates(pack) {
  if (isBlankPackValue(pack?.fuel)) return [];
  const t = String(pack.fuel).toLowerCase();
  if (/plug-?in|phev/.test(t)) return ["Plug-in hybrid", "Plugin hybrid", "Hybrid"];
  if (/hybrid/.test(t)) return ["Hybrid"];
  if (/electric|\bev\b/.test(t)) return ["Electric"];
  if (/diesel/.test(t)) return ["Diesel"];
  if (/flex|e85/.test(t)) return ["Flex", "Flex fuel"];
  if (/hydrogen|fuel cell/.test(t)) return ["Hydrogen"];
  if (/gas/.test(t)) return ["Gasoline"];
  return [String(pack.fuel).trim()];
}

async function fillChoiceAny(matchers, values, exclude = []) {
  const list = [...new Set((values || []).map((v) => String(v || "").trim()).filter((v) => !isBlankPackValue(v)))];
  for (const v of list) {
    if (await fillChoice(matchers, v, exclude)) return true;
  }
  return false;
}

function allInputs() {
  return [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]), textarea, [contenteditable]:not([contenteditable=false]), [role=textbox]"
    ),
  ];
}

function isMultilineEl(el) {
  return (
    el instanceof HTMLTextAreaElement ||
    el.isContentEditable ||
    el.getAttribute("aria-multiline") === "true" ||
    (el.getAttribute("role") === "textbox" && !(el instanceof HTMLInputElement))
  );
}

function isDisplayed(el) {
  if (!el || el.disabled) return false;
  try {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
  } catch {
    /* ignore */
  }
  const r = el.getBoundingClientRect();
  return r.width >= 2 || r.height >= 2 || el.offsetParent != null;
}

function innermostEditable(el) {
  if (!el) return null;
  const inner = el.querySelector?.("textarea, [contenteditable]:not([contenteditable=false])");
  if (inner) return inner;
  return el;
}

function controlInside(root) {
  if (!root) return null;
  if (root.matches?.("input, textarea, [contenteditable], [role=textbox]")) return innermostEditable(root);
  const list = [
    ...root.querySelectorAll(
      "textarea, [contenteditable]:not([contenteditable=false]), [role=textbox], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button])"
    ),
  ];
  const visible = list.filter(isDisplayed);
  const pool = visible.length ? visible : list;
  const pick = pool.find((el) => isMultilineEl(el)) || pool[0];
  return pick ? innermostEditable(pick) : null;
}

function usableDescription(el) {
  if (!el || isOffLimitsControl(el)) return false;
  const lab = labelText(el);
  if (isProtectedLabel(lab)) return false;
  if (DESC_EXCLUDE.some((x) => x.test(lab))) return false;
  return true;
}

function findField(matchers, { exclude = [], prefer } = {}) {
  const hits = [];
  for (const el of allInputs()) {
    if (isOffLimitsControl(el)) continue;
    const own = ownLabel(el);
    if (isVinLabel(own) || isOffLimitsLabel(own)) continue;
    if (isExcludedLabel(own, matchers, exclude)) continue;
    if (own && matchers.some((m) => m.test(own))) {
      hits.push({ el, lab: own, ownHit: true });
      continue;
    }
    const deep = labelText(el);
    if (isVinLabel(deep)) continue;
    if (isExcludedLabel(deep, matchers, exclude)) continue;
    if (deep && matchers.some((m) => m.test(deep))) {
      hits.push({ el, lab: deep, ownHit: false });
    }
  }
  if (!hits.length) return null;
  const pool = hits.some((h) => h.ownHit) ? hits.filter((h) => h.ownHit) : hits;
  if (prefer === "multiline") {
    const multi = pool.find((h) => isMultilineEl(h.el));
    if (multi) return multi.el;
  }
  if (prefer === "single") {
    const single = pool.find((h) => h.el instanceof HTMLInputElement && !h.el.isContentEditable);
    if (single) return single.el;
  }
  pool.sort((a, b) => a.lab.length - b.lab.length);
  return pool[0].el;
}

function fillText(matchers, value, exclude, prefer) {
  if (value == null || value === "") return false;
  const el = findField(matchers, { exclude, prefer });
  if (!el || isOffLimitsControl(el)) return false;
  return fillMultiline(el, value);
}

function optionText(el) {
  return shortText(el?.textContent || el?.getAttribute?.("aria-label") || "");
}

function isChoiceNode(el) {
  return el?.matches?.(
    '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], select, [role="listbox"], [role="button"]'
  );
}

function choiceInside(root) {
  if (!root) return null;
  if (root instanceof HTMLSelectElement) return root;
  if (root instanceof HTMLInputElement) {
    const t = (root.type || "").toLowerCase();
    if (["hidden", "checkbox", "radio", "file", "submit", "button"].includes(t)) return null;
    return root;
  }
  if (isChoiceNode(root)) return root;
  return (
    root.querySelector?.(
      '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button])'
    ) || null
  );
}

function choiceControlAfterLabel(node) {
  let sib = node.nextElementSibling;
  for (let i = 0; i < 6 && sib; i++) {
    const c = choiceInside(sib);
    if (c && !isOffLimitsControl(c) && !isUnsafeClickTarget(c)) return c;
    sib = sib.nextElementSibling;
  }
  let parent = node.parentElement;
  for (let d = 0; d < 5 && parent; d++) {
    const c = choiceInside(parent);
    if (c && !isOffLimitsControl(c) && !isUnsafeClickTarget(c) && c !== node && !c.contains?.(node)) return c;
    sib = parent.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++) {
      const cc = choiceInside(sib);
      if (cc && !isOffLimitsControl(cc) && !isUnsafeClickTarget(cc)) return cc;
      sib = sib.nextElementSibling;
    }
    parent = parent.parentElement;
  }
  return null;
}

function findChoiceByNearbyLabel(matchers, exclude = []) {
  const nodes = document.querySelectorAll("span, label, div, p, legend, [role=label]");
  for (const node of nodes) {
    if (isControl(node) || isChoiceNode(node)) continue;
    if (node.querySelector("input, textarea, [contenteditable], [role=textbox], [role=combobox]")) continue;
    const t = shortText(node.textContent).toLowerCase();
    if (!t || t.length > 40) continue;
    if (!matchers.some((m) => m.test(t))) continue;
    if (isExcludedLabel(t, matchers, exclude)) continue;
    if (isOffLimitsLabel(t) || isVinLabel(t)) continue;
    const control = choiceControlAfterLabel(node);
    if (control) return control;
  }
  return null;
}

function findChoiceControl(matchers, exclude = []) {
  const nodes = [
    ...document.querySelectorAll(
      '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button])'
    ),
  ];
  const hits = [];
  for (const el of nodes) {
    const own = ownLabel(el);
    const lab = own || labelText(el);
    if (!lab) continue;
    if (isOffLimitsControl(el) || isVinLabel(own) || isVinLabel(lab) || isOffLimitsLabel(own) || isOffLimitsLabel(lab)) continue;
    if (isExcludedLabel(own, matchers, exclude) || isExcludedLabel(lab, matchers, exclude)) continue;
    const ownHit = own && matchers.some((m) => m.test(own));
    const deepHit = matchers.some((m) => m.test(lab) || m.test(labelText(el)));
    if (!ownHit && !deepHit) continue;
    hits.push({ el, lab: own || lab, ownHit });
  }
  if (!hits.length) {
    for (const el of document.querySelectorAll("[aria-label], [role=button]")) {
      if (isUnsafeClickTarget(el)) continue;
      const own = ownLabel(el);
      const lab = own || labelText(el);
      if (!lab) continue;
      if (isOffLimitsControl(el) || isVinLabel(own) || isVinLabel(lab) || isOffLimitsLabel(own) || isOffLimitsLabel(lab)) continue;
      if (isExcludedLabel(own, matchers, exclude) || isExcludedLabel(lab, matchers, exclude)) continue;
      if (!matchers.some((m) => m.test(own) || m.test(lab))) continue;
      if (el.closest("input, textarea, [contenteditable]")) continue;
      hits.push({ el, lab, ownHit: Boolean(own && matchers.some((m) => m.test(own))) });
    }
  }
  if (!hits.length) return null;
  const pool = hits.some((h) => h.ownHit) ? hits.filter((h) => h.ownHit) : hits;
  pool.sort((a, b) => a.lab.length - b.lab.length);
  return pool[0].el;
}

function fillNativeSelect(el, value) {
  const want = String(value).toLowerCase();
  const opt = [...el.options].find((o) => {
    const t = shortText(o.textContent).toLowerCase();
    return t === want || o.value === String(value) || t.startsWith(want);
  });
  if (!opt) return false;
  el.value = opt.value;
  try {
    el._valueTracker?.setValue("");
  } catch {
    /* ignore */
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function visibleChoiceOptions(root) {
  const scope = root && root.querySelectorAll ? root : document;
  return [
    ...scope.querySelectorAll(
      '[role="option"], [role="menuitem"], [role="menuitemradio"], li[role="option"], [role="listbox"] [role="option"], [role="listbox"] > div, [role="listbox"] > li'
    ),
  ].filter((o) => {
    if (isUnsafeClickTarget(o) || !isDisplayed(o) || !optionText(o)) return false;
    if (o.closest?.("[role=banner], [role=navigation], header") && !o.closest?.("[role=listbox]")) return false;
    return true;
  });
}

async function waitForOptions({ tries = 12, delayMs = 120 } = {}) {
  let last = visibleChoiceOptions();
  if (last.length) return last;
  for (let i = 0; i < tries; i++) {
    await delay(delayMs);
    last = visibleChoiceOptions();
    if (last.length) return last;
  }
  return last;
}

function closeOpenListbox() {
  // NEVER send Escape to document/window — Facebook's create-vehicle
  // composer is a dialog; Escape dismisses it and dumps Jed on home.
  const expanded = document.querySelector('[role="combobox"][aria-expanded="true"]');
  if (expanded && !isUnsafeClickTarget(expanded)) {
    try {
      expanded.click();
    } catch {
      /* ignore */
    }
    return;
  }
  const lists = [...document.querySelectorAll('[role="listbox"]')].filter((n) => isDisplayed(n) && !n.hidden);
  for (const list of lists) {
    try {
      list.hidden = true;
    } catch {
      /* ignore */
    }
  }
}

function pickOpenOption(want) {
  const w = shortText(want).toLowerCase();
  if (!w) return false;
  const opts = visibleChoiceOptions();
  const scored = opts
    .map((el) => {
      const t = optionText(el).toLowerCase();
      let score = 0;
      if (t === w) score = 3;
      else if (t.startsWith(w)) score = 2;
      else if (t.includes(w)) score = 1;
      return { el, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const hit = scored[0]?.el;
  if (!hit) return false;
  try {
    hit.click();
  } catch {
    return false;
  }
  return true;
}

function choiceLooksSet(el, value) {
  if (!el) return false;
  if (el instanceof HTMLSelectElement) {
    const t = shortText(el.selectedOptions?.[0]?.textContent || el.value);
    return t.toLowerCase() === String(value).toLowerCase() || t.toLowerCase().startsWith(String(value).toLowerCase());
  }
  return looksFilled(el, value);
}

function typeIntoOpenChoice(el, value) {
  const text = String(value);
  const active = document.activeElement;
  const nearbyInput =
    el.parentElement?.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio])") ||
    (el.nextElementSibling instanceof HTMLInputElement ? el.nextElementSibling : null);
  const input =
    (active instanceof HTMLInputElement && active) ||
    (el instanceof HTMLInputElement && el) ||
    el.querySelector?.("input:not([type=hidden]):not([type=checkbox]):not([type=radio])") ||
    nearbyInput ||
    document.querySelector("[role=listbox] input:not([type=hidden]), [role=combobox] input:not([type=hidden])");
  if (input && !isOffLimitsControl(input) && !isVinControl(input)) {
    fillMultiline(input, text);
    return true;
  }
  const target = active && active.getAttribute?.("role") === "combobox" ? active : el;
  try {
    target.focus();
  } catch {
    /* ignore */
  }
  try {
    if (document.execCommand("insertText", false, text)) return true;
  } catch {
    /* ignore */
  }
  try {
    target.textContent = text;
    target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: text }));
    return true;
  } catch {
    return false;
  }
}

async function pickExactOrClosestYear(want) {
  if (pickOpenOption(want)) return true;
  return false;
}

async function fillChoice(matchers, value, exclude = []) {
  if (isBlankPackValue(value)) return false;
  closeOpenListbox();
  await delay(40);
  const el =
    findChoiceByNearbyLabel(matchers, exclude) ||
    findChoiceControl(matchers, exclude) ||
    findField(matchers, { exclude });
  if (!el || isUnsafeClickTarget(el) || isOffLimitsControl(el) || isVinLabel(ownLabel(el))) return false;
  if (el instanceof HTMLSelectElement) return fillNativeSelect(el, value);
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && fillMultiline(el, value) && looksFilled(el, value)) {
    return true;
  }
  scrollElIntoView(el);
  try {
    el.focus();
  } catch {
    /* ignore */
  }
  try {
    el.click();
  } catch {
    /* ignore */
  }
  let opts = await waitForOptions();
  if (opts.length && (await pickExactOrClosestYear(value))) {
    await delay(80);
    return choiceLooksSet(el, value) || true;
  }
  typeIntoOpenChoice(el, value);
  opts = await waitForOptions();
  if (await pickExactOrClosestYear(value)) {
    await delay(80);
    return true;
  }
  if (/^\d{4}$/.test(String(value).trim())) {
    typeIntoOpenChoice(el, "");
    opts = await waitForOptions();
    const closest = closestYearValue(value, opts.map(optionText));
    if (closest && pickOpenOption(closest)) {
      await delay(80);
      return true;
    }
  }
  if (el instanceof HTMLInputElement) return fillMultiline(el, value) && looksFilled(el, value);
  return choiceLooksSet(el, value);
}

async function fillChoiceRetry(matchers, value, exclude = [], tries = 3) {
  for (let i = 0; i < tries; i++) {
    if (await fillChoice(matchers, value, exclude)) return true;
    await delay(220);
  }
  return false;
}

async function fillChoiceAnyRetry(matchers, values, exclude = []) {
  const list = [...new Set((values || []).map((v) => String(v || "").trim()).filter((v) => !isBlankPackValue(v)))];
  for (const v of list) {
    if (await fillChoiceRetry(matchers, v, exclude)) return true;
  }
  return false;
}

function controlAfterLabel(node) {
  let sib = node.nextElementSibling;
  for (let i = 0; i < 6 && sib; i++) {
    const c = controlInside(sib) || (isControl(sib) ? innermostEditable(sib) : null);
    if (c && usableDescription(c)) return c;
    sib = sib.nextElementSibling;
  }
  let parent = node.parentElement;
  for (let d = 0; d < 5 && parent; d++) {
    const c = controlInside(parent);
    if (c && usableDescription(c)) return c;
    sib = parent.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++) {
      const cc = controlInside(sib) || (isControl(sib) ? innermostEditable(sib) : null);
      if (cc && usableDescription(cc)) return cc;
      sib = sib.nextElementSibling;
    }
    parent = parent.parentElement;
  }
  return null;
}

function findDescriptionByAttr() {
  for (const sel of DESC_ATTR_SELECTORS) {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll(sel)];
    } catch {
      continue;
    }
    for (const node of nodes) {
      const el = controlInside(node);
      if (el && usableDescription(el)) {
        const kind = el instanceof HTMLTextAreaElement
          ? "textarea"
          : el.isContentEditable
            ? "[contenteditable]"
            : el.getAttribute("role") === "textbox"
              ? "[role=textbox]"
              : el.tagName.toLowerCase();
        return { el, via: `${sel} ${kind}` };
      }
    }
  }
  return null;
}

function findDescriptionByNearbyLabel() {
  const nodes = document.querySelectorAll("span, label, div, p, legend, [role=label]");
  for (const node of nodes) {
    if (node.querySelector("input, textarea, [contenteditable], [role=textbox]")) continue;
    const t = shortText(node.textContent).toLowerCase();
    if (!t || t.length > 60) continue;
    if (!DESC_MATCHERS.some((m) => m.test(t))) continue;
    if (isProtectedLabel(t) && !/\bdescription\b/.test(t)) continue;
    const control = controlAfterLabel(node);
    if (control) return { el: resolveEditable(control), via: `near-label("${t}")` };
  }
  return null;
}

function findDescriptionFallback() {
  const textareas = [...document.querySelectorAll("textarea")].filter((el) => usableDescription(el) && isDisplayed(el));
  if (textareas.length === 1) return { el: textareas[0], via: "lone-textarea" };

  const boxes = allInputs().filter((el) => isMultilineEl(el) && usableDescription(el) && isDisplayed(el));
  if (!boxes.length) return null;
  boxes.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  });
  return { el: resolveEditable(boxes[0]), via: "fallback-largest-multiline" };
}

function findDescriptionField() {
  const byAttr = findDescriptionByAttr();
  if (byAttr) return byAttr;

  const labeled = findField(DESC_MATCHERS, { exclude: DESC_EXCLUDE, prefer: "multiline" });
  if (labeled && usableDescription(labeled)) {
    const el = resolveEditable(labeled);
    const kind = el instanceof HTMLTextAreaElement
      ? "textarea"
      : el.isContentEditable
        ? "[contenteditable]"
        : "[role=textbox]";
    return { el, via: `labeled ${kind}` };
  }

  const near = findDescriptionByNearbyLabel();
  if (near) return near;

  return findDescriptionFallback();
}

function revealDescriptionArea() {
  const hints = [];
  for (const n of document.querySelectorAll("span, label, div, p, [aria-label], [aria-placeholder]")) {
    const t = shortText(
      n.getAttribute("aria-label") || n.getAttribute("aria-placeholder") || n.textContent || ""
    ).toLowerCase();
    if (t && t.length < 80 && DESC_MATCHERS.some((m) => m.test(t))) {
      hints.push(n);
      if (hints.length > 8) break;
    }
  }
  for (const n of hints) scrollElIntoView(n);
  const scroller = document.querySelector("[role=main], [role=dialog]") || document.scrollingElement;
  if (scroller) {
    try {
      scroller.scrollTop = Math.min(scroller.scrollHeight, (scroller.scrollTop || 0) + 900);
    } catch {
      /* ignore */
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PHOTO_LABEL_RE = /\b(photo|photos|picture|pictures|image|images|gallery|media)\b/i;
const PHOTO_EXCLUDE_RE = /\b(profile|avatar|cover photo|comment|messenger|story)\b/i;
const PHOTO_REVEAL_RE = /^(add photos?|upload photos?|add pictures?|choose (files?|photos?)|photos|add media)$/i;
const NEVER_CLICK_RE =
  /^(post|publish|next|submit|share|buy|offer|make offer|buy now|create listing|publish listing|home|facebook|close|cancel|back|go back|exit|discard|not now)$/i;
const HOME_CLICK_RE = /^(home|facebook|close composer|close dialog)$/i;
const CHROME_NAV_RE =
  /^(marketplace|selling|inbox|notifications|menu|account|profile|search facebook|facebook search)$/i;

function photoContext(el) {
  if (!el) return "";
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
    el.getAttribute("name"),
    el.getAttribute("accept"),
    el.getAttribute("id"),
  ];
  let node = el;
  for (let d = 0; d < 6 && node; d++) {
    bits.push(node.getAttribute?.("aria-label"));
    bits.push(node.getAttribute?.("aria-placeholder"));
    const labeledBy = node.getAttribute?.("aria-labelledby");
    if (labeledBy) {
      for (const id of labeledBy.split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) bits.push(n.textContent);
      }
    }
    node = node.parentElement;
  }
  return bits.filter(Boolean).map(shortText).join(" ").toLowerCase();
}

function acceptsImages(input) {
  const accept = (input.getAttribute("accept") || "").toLowerCase();
  return !accept || accept.includes("image") || accept.includes("*/*") || accept.includes("*");
}

function findPhotoFileInput() {
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  const scored = [];
  for (const el of inputs) {
    if (el.disabled) continue;
    if (!acceptsImages(el)) continue;
    const lab = photoContext(el);
    if (PHOTO_EXCLUDE_RE.test(lab) && !PHOTO_LABEL_RE.test(lab)) continue;
    let score = 0;
    if (el.multiple) score += 3;
    if (/image/.test(el.getAttribute("accept") || "")) score += 2;
    if (PHOTO_LABEL_RE.test(lab)) score += 6;
    if (el.closest("[role=dialog], [role=main], form")) score += 1;
    scored.push({ el, score, lab, via: el.multiple ? 'input[type=file][multiple]' : 'input[type=file]' });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function findPhotoDropzone() {
  const nodes = [
    ...document.querySelectorAll("[aria-label], [role=button], button, [tabindex], div, span"),
  ];
  for (const n of nodes) {
    const lab = shortText(n.getAttribute("aria-label") || n.getAttribute("title") || "");
    if (PHOTO_REVEAL_RE.test(lab) && !NEVER_CLICK_RE.test(lab)) return n;
    const t = shortText(n.textContent);
    if (t && t.length < 28 && PHOTO_REVEAL_RE.test(t) && !NEVER_CLICK_RE.test(t)) {
      if (n.querySelector?.("input, textarea, [contenteditable]")) continue;
      return n;
    }
  }
  return null;
}

function hrefOf(el) {
  if (!el) return "";
  const a = el.closest?.("a[href]") || (el.tagName === "A" ? el : null);
  return a?.getAttribute?.("href") || a?.href || "";
}

function isAwayHref(href) {
  const raw = String(href || "").trim();
  if (!raw || raw === "#" || /^javascript:/i.test(raw)) return false;
  const nav = fbNav();
  if (nav?.hrefLooksLikeHome && nav.hrefLooksLikeHome(raw, location.href)) return true;
  if (raw === "/" || raw === "https://www.facebook.com/" || raw === "https://facebook.com/") return true;
  try {
    const u = new URL(raw, location.href);
    if (nav?.isFacebookHomeUrl && nav.isFacebookHomeUrl(u.href)) return true;
    if (nav?.isMarketplaceBrowseUrl && nav.isMarketplaceBrowseUrl(u.href)) return true;
    if (nav?.isCreateVehicleListingUrl && nav.isCreateVehicleListingUrl(u.href)) return false;
    if (nav?.isFacebookUrl && nav.isFacebookUrl(u.href) && !nav.isCreateVehicleListingUrl(u.href)) return true;
    if (u.pathname === "/" || u.pathname === "") return true;
  } catch {
    return raw === "/";
  }
  return false;
}

function isUnsafeClickTarget(el) {
  if (!el) return true;
  if (isAwayHref(hrefOf(el))) return true;
  const t = shortText(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "");
  if (NEVER_CLICK_RE.test(t) || HOME_CLICK_RE.test(t) || CHROME_NAV_RE.test(t)) return true;
  if (/\b(post|publish) listing\b/i.test(t) || /^(buy|offer)\b/i.test(t)) return true;
  if (el.closest?.("[role=banner], [role=navigation], header")) {
    if (!el.closest?.("[role=dialog], [role=main], form, .fb-field, .fb-specs, .fb-composer")) return true;
  }
  return isOffLimitsLabel(ownLabel(el)) || isOffLimitsLabel(t);
}

function revealPhotoPicker() {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
  const scroller = document.querySelector("[role=main], [role=dialog]") || document.scrollingElement;
  if (scroller) {
    try {
      scroller.scrollTop = 0;
    } catch {
      /* ignore */
    }
  }
  const zone = findPhotoDropzone();
  if (zone && !isUnsafeClickTarget(zone)) {
    scrollElIntoView(zone);
    try {
      zone.click();
    } catch {
      /* ignore */
    }
    return zone;
  }
  return null;
}

function assignFilesToInput(input, files) {
  if (!input || !files?.length) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  try {
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  } catch {
    /* ignore */
  }
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return input.files && input.files.length === files.length;
}

function dropFilesOn(target, files) {
  if (!target || !files?.length) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  for (const type of ["dragenter", "dragover", "drop"]) {
    try {
      target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt })
      );
    } catch {
      /* older engines */
    }
  }
  return true;
}

async function waitForPhotoInput({ tries = 16, delayMs = 280 } = {}) {
  let last = findPhotoFileInput();
  if (last) return last;
  revealPhotoPicker();
  for (let i = 0; i < tries; i++) {
    await delay(delayMs);
    last = findPhotoFileInput();
    if (last) return last;
    if (i === 3 || i === 8) revealPhotoPicker();
  }
  return last;
}

function filesFromPrepared(payloads) {
  if (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.filesFromTransfer) {
    return LotLinkerPhotos.filesFromTransfer(payloads);
  }
  return [];
}

async function loadPhotoFiles(pack) {
  const empty = { ok: false, files: [], wanted: 0, stripped: 0, source: "", error: "No photos" };
  if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "LOT_LINKER_PREPARE_PHOTOS", pack }, (r) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve(r);
        });
      });
      if (res?.ok && res.files?.length) {
        return {
          ok: true,
          files: filesFromPrepared(res.files),
          wanted: res.wanted,
          stripped: res.stripped,
          source: res.source,
          error: res.error || "",
          missedUrls: res.missedUrls || 0,
        };
      }
      if (res && !res.ok && res.error) empty.error = res.error;
    } catch {
      /* fall through to in-page fetch (fixture / SW missing) */
    }
  }
  if (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.fetchPhotoFiles) {
    return LotLinkerPhotos.fetchPhotoFiles(pack);
  }
  return empty;
}

async function uploadPhotoFiles(files) {
  if (!files?.length) return { ok: false, via: "", count: 0, error: "No photo files" };
  const found = await waitForPhotoInput();
  if (!found?.el) {
    return { ok: false, via: "", count: 0, error: "no photo picker on this page" };
  }
  scrollElIntoView(found.el);
  let ok = assignFilesToInput(found.el, files);
  if (!ok) {
    const zone = findPhotoDropzone() || found.el.closest("div") || found.el;
    dropFilesOn(zone, files);
    ok = assignFilesToInput(found.el, files) || (found.el.files && found.el.files.length > 0);
  }
  const count = found.el.files?.length || (ok ? files.length : 0);
  return {
    ok: count > 0,
    via: found.via || "input[type=file]",
    count,
    error: count ? "" : "Marketplace file input rejected files",
  };
}

async function fillPhotos(pack) {
  const photos = {
    attempted: false,
    count: 0,
    wanted: 0,
    stripped: 0,
    source: "",
    via: "",
    error: "",
  };
  const hasSource =
    (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.hasPhotoSource?.(pack)) ||
    Boolean(pack?.photoUrls?.length || pack?.vdpUrl);
  if (!hasSource) return { skipped: true, photos };

  photos.attempted = true;
  const loaded = await loadPhotoFiles(pack);
  photos.wanted = loaded.wanted || 0;
  photos.stripped = loaded.stripped || 0;
  photos.source = loaded.source || "";
  if (!loaded.ok || !loaded.files?.length) {
    photos.error = loaded.error || "could not fetch photos";
    return { skipped: false, ok: false, photos };
  }
  const placed = await uploadPhotoFiles(loaded.files);
  photos.via = placed.via;
  photos.count = placed.count;
  if (!placed.ok) {
    photos.error = placed.error || "photo picker missed";
    return { skipped: false, ok: false, photos };
  }
  if (photos.wanted && photos.count < photos.wanted) {
    photos.error = `uploaded ${photos.count} of ${photos.wanted}`;
  }
  return { skipped: false, ok: true, photos };
}

function listingFromPack(pack) {
  if (typeof LotLinkerListing !== "undefined") {
    if (LotLinkerListing.packToListing) return LotLinkerListing.packToListing(pack);
    if (LotLinkerListing.fromPack) return LotLinkerListing.fromPack(pack);
  }
  return {
    title: pack.title || "",
    modelLine: pack.modelLine || "",
    body: pack.body || "",
  };
}

function fillDescription(value) {
  if (value == null || value === "") return { ok: false, via: "" };
  const found = findDescriptionField();
  if (!found?.el) return { ok: false, via: "" };
  if (isOffLimitsControl(found.el) || isProtectedLabel(labelText(found.el))) return { ok: false, via: "" };
  scrollElIntoView(found.el);
  const ok = fillMultiline(found.el, value);
  return { ok, via: ok ? found.via : "" };
}

const MODEL_EXCLUDE = [
  /description/,
  /\byear\b/,
  /\bmake\b/,
  /\bmileage\b/,
  /\bodometer\b/,
  /\bvin\b/,
  /vehicle identification/,
  /more details/,
  /clean title/,
  /title status/,
  /listing title/,
  /item title/,
  /\bprice\b/,
  /\btrim\b/,
];

const CHOICE_EXCLUDE = [
  /description/,
  /tell buyers/,
  /what makes/,
  /more details/,
  /listing title/,
  /item title/,
  /\bvin\b/,
  /vehicle identification/,
  /clean title/,
  /title status/,
  /vehicle condition/,
  /^condition$/,
];

function markIfPresent(mark, key, packHas, ok) {
  if (!packHas) return;
  mark(key, ok);
}

const VEHICLE_TYPE_MATCHERS = [
  /^vehicle type$/,
  /\bvehicle type\b/,
  /type of vehicle/,
  /what (type|kind) of vehicle/,
  /^vehicle category$/,
];

const VEHICLE_TYPE_EXCLUDE = [
  ...CHOICE_EXCLUDE,
  /\byear\b/,
  /\bmake\b/,
  /\bmodel\b/,
  /\bvin\b/,
  /body style/,
  /\bprice\b/,
];

const VEHICLE_TYPE_TILE_RE =
  /^(car\/truck|car\s*\/\s*truck|cars?\s*(&|and)\s*trucks?|car|truck|pickup(\s*truck)?)$/i;

function vehicleTypeChoiceValues(pack) {
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.marketplaceVehicleTypeValues) {
    return LotLinkerListing.marketplaceVehicleTypeValues(pack);
  }
  return ["Car/Truck", "Car / Truck", "Car", "Truck"];
}

function findVehicleTypeControl() {
  return (
    findChoiceByNearbyLabel(VEHICLE_TYPE_MATCHERS, VEHICLE_TYPE_EXCLUDE) ||
    findChoiceControl(VEHICLE_TYPE_MATCHERS, VEHICLE_TYPE_EXCLUDE) ||
    findField(VEHICLE_TYPE_MATCHERS, { exclude: VEHICLE_TYPE_EXCLUDE }) ||
    findVehicleTypeTiles()[0] ||
    null
  );
}

function findVehicleTypeTiles() {
  const nodes = [
    ...document.querySelectorAll(
      '[role=radio], [role=tab], [role=option], [aria-checked], input[type=radio], button, [role=button], label'
    ),
  ];
  const hits = [];
  for (const el of nodes) {
    if (isUnsafeClickTarget(el) || isAwayHref(hrefOf(el))) continue;
    const radio = el.matches?.("input[type=radio]") || el.querySelector?.("input[type=radio]");
    if (!radio && !isDisplayed(el)) continue;
    const t = shortText(el.getAttribute("aria-label") || el.textContent || "");
    if (!t || t.length > 48) continue;
    if (!VEHICLE_TYPE_TILE_RE.test(t)) continue;
    hits.push(el);
  }
  return hits;
}

function pickVehicleTypeTile(values) {
  const tiles = findVehicleTypeTiles();
  if (!tiles.length) return false;
  const list = [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))];
  for (const want of list) {
    const w = shortText(want).toLowerCase();
    const scored = tiles
      .map((el) => {
        const t = shortText(el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
        let score = 0;
        if (t === w) score = 3;
        else if (t.startsWith(w) || (w.startsWith(t) && t.length >= 3)) score = 2;
        else if (t.includes(w) || (w.includes(t) && t.length >= 3)) score = 1;
        return { el, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const hit = scored[0]?.el;
    if (!hit || isUnsafeClickTarget(hit)) continue;
    try {
      hit.click();
    } catch {
      continue;
    }
    return true;
  }
  return false;
}

function vehicleTypeLooksSet(values) {
  const list = (values || []).map((v) => shortText(v).toLowerCase()).filter(Boolean);
  if (!list.length) return false;

  for (const tile of findVehicleTypeTiles()) {
    const checked =
      tile.getAttribute("aria-checked") === "true" ||
      tile.getAttribute("aria-selected") === "true" ||
      tile.checked === true ||
      /\bselected\b/i.test(tile.className || "");
    if (!checked) continue;
    const t = shortText(tile.getAttribute("aria-label") || tile.textContent || "").toLowerCase();
    if (list.some((w) => t === w || t.includes(w))) return true;
  }

  const el = findVehicleTypeControl();
  if (!el) return false;
  if (el.getAttribute?.("role") === "radiogroup") return false;
  if (el instanceof HTMLSelectElement) {
    const t = shortText(el.selectedOptions?.[0]?.textContent || el.value).toLowerCase();
    return list.some((w) => t === w || t.includes(w));
  }
  const caption = shortChoiceCaption(el).toLowerCase();
  const val = shortText(el.value).toLowerCase();
  const got = val || caption;
  if (!got || /^(vehicle type|type of vehicle|vehicle category|type)$/.test(got)) return false;
  return list.some((w) => got === w || got.includes(w));
}

async function fillVehicleTypeFirst(pack) {
  const values = vehicleTypeChoiceValues(pack);
  if (vehicleTypeLooksSet(values)) return true;

  if (pickVehicleTypeTile(values)) {
    await delay(200);
    if (vehicleTypeLooksSet(values)) return true;
  }

  if (await fillChoiceAnyRetry(VEHICLE_TYPE_MATCHERS, values, VEHICLE_TYPE_EXCLUDE)) {
    await delay(120);
    if (vehicleTypeLooksSet(values)) return true;
  }

  const el = findVehicleTypeControl();
  if (el && !isUnsafeClickTarget(el) && !isOffLimitsControl(el)) {
    scrollElIntoView(el);
    try {
      el.click();
    } catch {
      /* ignore */
    }
    const opts = await waitForOptions();
    if (opts.length) {
      for (const v of values) {
        if (pickOpenOption(v)) break;
      }
    }
    if (pickVehicleTypeTile(values)) {
      await delay(200);
    }
  }
  return vehicleTypeLooksSet(values);
}

function isVehicleFormReady() {
  return Boolean(findVehicleTypeControl());
}

async function waitForVehicleForm({ tries = 25, delayMs = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (isVehicleFormReady()) return true;
    await delay(delayMs);
  }
  return isVehicleFormReady();
}

async function waitForDetailsFields({ tries = 15, delayMs = 200 } = {}) {
  const yearMatchers = [/^year$/, /\byear\b/, /vehicle year/, /model year/];
  for (let i = 0; i < tries; i++) {
    const year =
      findChoiceByNearbyLabel(yearMatchers, CHOICE_EXCLUDE) ||
      findChoiceControl(yearMatchers, CHOICE_EXCLUDE);
    if (year) return true;
    await delay(delayMs);
  }
  return false;
}

function gateRemainingKeys(mark, pack, listing) {
  const p = pack || {};
  markIfPresent(mark, "year", yearCandidates(p).length > 0, false);
  markIfPresent(mark, "make", !isBlankPackValue(p.make), false);
  markIfPresent(mark, "price", Boolean(priceDigits(p)), false);
  mark("model", false);
  markIfPresent(mark, "mileage", Boolean(mileageDigits(p)), false);
  markIfPresent(mark, "bodyStyle", bodyStyleCandidates(p).length > 0, false);
  markIfPresent(mark, "exterior", !isBlankPackValue(p.exterior) || !isBlankPackValue(p.exteriorFb), false);
  markIfPresent(mark, "interior", !isBlankPackValue(p.interior) || !isBlankPackValue(p.interiorFb), false);
  markIfPresent(mark, "fuel", fuelCandidates(p).length > 0, false);
  mark("description", false);
}

async function fillPackOnce(pack) {
  // FIRST Vehicle type (Car/Truck from pack) MUST succeed. Then Year, Make,
  // Price, Model, Mileage, Body style, Exterior, Interior, Fuel, Description.
  // Never VIN. Never clean-title checkbox. Never vehicle condition.
  const p = pack || {};
  const listing = listingFromPack(p);
  const filled = [];
  const missed = [];
  const mark = (key, ok) => (ok ? filled : missed).push(key);
  const modelLine = listing.modelLine || "";
  const specExclude = [...CHOICE_EXCLUDE, /\byear\b/, /\bmake\b/, /\bmodel\b/, /\bprice\b/, /\bmileage\b/, /vehicle type/];

  const typeOk = await fillVehicleTypeFirst(p);
  const typeStuck = typeOk && vehicleTypeLooksSet(vehicleTypeChoiceValues(p));
  mark("vehicleType", typeStuck);
  if (!typeStuck) {
    gateRemainingKeys(mark, p, listing);
    return {
      filled: [...new Set(filled)],
      missed: [...new Set(missed)],
      modelLine,
      title: listing.title,
      descriptionHit: "",
      gated: true,
      notes: "Vehicle type must succeed before other fields. Never VIN. You hit Post.",
    };
  }
  await delay(400);
  await waitForDetailsFields();

  const yearVals = yearCandidates(p);
  markIfPresent(
    mark,
    "year",
    yearVals.length > 0,
    await fillChoiceAnyRetry(
      [/^year$/, /\byear\b/, /vehicle year/, /model year/],
      yearVals,
      [...CHOICE_EXCLUDE, /\bmake\b/, /\bmodel\b/]
    )
  );
  if (yearVals.length) await delay(200);

  const makeVal = isBlankPackValue(p.make) ? "" : String(p.make).trim();
  markIfPresent(
    mark,
    "make",
    Boolean(makeVal),
    await fillChoice([/^make$/, /\bmake\b/, /manufacturer/], makeVal, [...CHOICE_EXCLUDE, /\byear\b/, /\bmodel\b/])
  );
  if (makeVal) await delay(150);

  const price = priceDigits(p);
  markIfPresent(
    mark,
    "price",
    Boolean(price),
    fillText(
      [/^price$/, /\bprice\b/, /asking price/, /listing price/],
      price,
      [/mileage/, /odometer/, /description/, /\bmodel\b/, /year/, /make/, /\bvin\b/],
      "single"
    )
  );

  mark(
    "model",
    fillText([/^model$/, /\bvehicle model\b/, /\bmodel\b/], modelLine, MODEL_EXCLUDE, "single")
  );

  const miles = mileageDigits(p);
  markIfPresent(
    mark,
    "mileage",
    Boolean(miles),
    fillText(
      [/^mileage$/, /\bmileage\b/, /\bodometer\b/, /\bmiles\b/],
      miles,
      [/price/, /description/, /\bmodel\b/, /year/, /make/, /\bvin\b/],
      "single"
    )
  );

  const bodyVals = bodyStyleCandidates(p);
  markIfPresent(
    mark,
    "bodyStyle",
    bodyVals.length > 0,
    await fillChoiceAnyRetry(
      [/^body style$/, /\bbody style\b/, /\bbody type\b/, /^body$/, /\bvehicle (style|body)\b/],
      bodyVals,
      [...specExclude, /\bexterior\b/, /\binterior\b/, /\bfuel\b/]
    )
  );
  await delay(150);

  const extVals = mergedColorCandidates(p, "exterior");
  markIfPresent(
    mark,
    "exterior",
    !isBlankPackValue(p.exterior) || !isBlankPackValue(p.exteriorFb),
    await fillChoiceAnyRetry(
      [/^exterior$/, /\bexterior colou?r\b/, /\bexterior\b/, /outside colou?r/, /^colou?r$/, /\bvehicle colou?r\b/, /\bpaint colou?r\b/],
      extVals,
      [...specExclude, /\binterior\b/, /\bfuel\b/, /body style/]
    )
  );
  await delay(150);

  const intVals = mergedColorCandidates(p, "interior");
  markIfPresent(
    mark,
    "interior",
    !isBlankPackValue(p.interior) || !isBlankPackValue(p.interiorFb),
    await fillChoiceAnyRetry(
      [/^interior$/, /\binterior colou?r\b/, /\binterior\b/, /inside colou?r/, /\bseat colou?r\b/],
      intVals,
      [...specExclude, /\bexterior\b/, /\bfuel\b/, /body style/]
    )
  );
  await delay(150);

  const fuelVals = fuelCandidates(p);
  markIfPresent(
    mark,
    "fuel",
    fuelVals.length > 0,
    await fillChoiceAny(
      [/^fuel type$/, /\bfuel type\b/, /^fuel$/, /\bfuel\b/],
      fuelVals,
      [...specExclude, /\bexterior\b/, /\binterior\b/, /body style/]
    )
  );

  const desc = fillDescription(listing.body);
  mark("description", desc.ok);

  return {
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    modelLine,
    title: listing.title,
    descriptionHit: desc.via || "",
    notes: "Vehicle type first, then Year/Make/Price/Model/Mileage/body/colors/fuel + description + photos. Never VIN. You hit Post.",
  };
}

function mergePhotoResult(textResult, photoResult) {
  const filled = [...(textResult.filled || [])];
  const missed = [...(textResult.missed || [])];
  const photos = photoResult?.photos || { attempted: false, count: 0 };
  if (!photoResult?.skipped) {
    if (photoResult?.ok && photos.count > 0) filled.push("photos");
    else missed.push("photos");
  }
  return {
    ...textResult,
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    photos,
    notes: "Vehicle type first, then Year/Make/Price/Model/Mileage/body/colors/fuel + description + photos. Never VIN. You hit Post.",
  };
}

async function fillPack(pack) {
  let textResult = await fillPackOnce(pack);
  const retryKeys = [
    "vehicleType",
    "year",
    "make",
    "price",
    "model",
    "mileage",
    "bodyStyle",
    "exterior",
    "interior",
    "fuel",
    "description",
  ].filter((k) => textResult.missed.includes(k));
  if (retryKeys.length) {
    if (textResult.gated) {
      await delay(280);
      textResult = await fillPackOnce(pack);
    } else {
      revealDescriptionArea();
      await delay(280);
      textResult = await fillPackOnce(pack);
    }
  }
  const photoResult = await fillPhotos(pack || {});
  return mergePhotoResult(textResult, photoResult);
}

function postedApi() {
  return typeof LotLinkerPosted !== "undefined" ? LotLinkerPosted : null;
}

function clickLabel(el) {
  if (!el) return "";
  return shortText(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "");
}

function rememberFillForPostWatch(pack) {
  const api = postedApi();
  const stock = pack?.stock;
  if (!api?.rememberPendingFill || !stock) return;
  api.rememberPendingFill(stock).catch(() => {});
}

function checkPendingPostSuccess() {
  const api = postedApi();
  if (!api?.maybeMarkPendingPosted) return;
  const text = (document.body?.innerText || "").slice(0, 8000);
  api.maybeMarkPendingPosted({ href: location.href, text }).catch(() => {});
}

function startPostedWatch() {
  const api = postedApi();
  if (!api || typeof chrome === "undefined" || !chrome.storage?.local) return;
  if (globalThis.__lotLinkerPostedWatch) return;
  globalThis.__lotLinkerPostedWatch = true;

  document.addEventListener(
    "click",
    (e) => {
      const el = e.target?.closest?.("button, [role=button], [role=menuitem], a, [tabindex]");
      if (!el) return;
      const lab = clickLabel(el);
      if (api.isUserPublishClickLabel(lab)) {
        api.noteUserClickedPost().catch(() => {});
      }
    },
    true
  );

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args);
    checkPendingPostSuccess();
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args);
    checkPendingPostSuccess();
    return r;
  };
  window.addEventListener("popstate", () => checkPendingPostSuccess());
  setInterval(checkPendingPostSuccess, 1200);
}

if (typeof globalThis !== "undefined") {
  globalThis.LotLinkerFill = {
    fillPack,
    fillPackOnce,
    fillPhotos,
    uploadPhotoFiles,
    assignFilesToInput,
    findPhotoFileInput,
    isMarketplacePath,
    isCreateVehicleListingPath,
    isFacebookHomePath,
    isVehicleFormReady,
    findVehicleTypeControl,
    fillVehicleTypeFirst,
    vehicleTypeChoiceValues,
    waitForVehicleForm,
    waitForOptions,
    isUnsafeClickTarget,
    isAwayHref,
    closeOpenListbox,
    findField,
    findDescriptionField,
    findChoiceByNearbyLabel,
    isExcludedLabel,
    colorCandidates,
    mergedColorCandidates,
    yearCandidates,
    closestYearValue,
    bodyStyleCandidates,
    labelText,
    startPostedWatch,
    rememberFillForPostWatch,
  };
}

function createVehicleUrl() {
  const nav = fbNav();
  return nav?.createVehicleListingUrl ? nav.createVehicleListingUrl() : "https://www.facebook.com/marketplace/create/vehicle";
}

function fillBlockedByLocation() {
  if (isFacebookHomePath()) {
    return {
      ok: false,
      needNavigate: true,
      url: createVehicleUrl(),
      error: "On Facebook home — open create vehicle listing instead",
    };
  }
  if (isCreateVehicleListingPath()) return null;
  if (isVehicleFormReady()) return null;
  if (isMarketplacePath() && !isVehicleFormReady()) {
    return {
      ok: false,
      needNavigate: true,
      url: createVehicleUrl(),
      error: "Not on Marketplace create vehicle listing",
    };
  }
  if (!isMarketplacePath()) {
    return {
      ok: false,
      needNavigate: true,
      url: createVehicleUrl(),
      error: "Open Facebook Marketplace create vehicle listing",
    };
  }
  return null;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "LOT_LINKER_FORM_READY") {
      sendResponse({
        ok: true,
        ready: isVehicleFormReady(),
        path: location.pathname,
        href: location.href,
        isCreate: isCreateVehicleListingPath(),
        isHome: isFacebookHomePath(),
      });
      return true;
    }
    if (msg?.type !== "LOT_LINKER_FILL") return;
    const blocked = fillBlockedByLocation();
    if (blocked) {
      sendResponse(blocked);
      return true;
    }
    Promise.resolve()
      .then(() => waitForVehicleForm())
      .then((ready) => {
        if (!ready && !isVehicleFormReady()) {
          return {
            ok: false,
            needNavigate: true,
            url: createVehicleUrl(),
            error: "Vehicle form not ready",
          };
        }
        return fillPack(msg.pack || {}).then((r) => {
          rememberFillForPostWatch(msg.pack || {});
          return { ok: true, ...r };
        });
      })
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
}

startPostedWatch();
