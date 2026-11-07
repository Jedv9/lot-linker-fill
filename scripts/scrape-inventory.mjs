/**
 * Lot Linker Fill — weekly inventory scraper.
 * Pulls Lexus of Brookfield PRE-OWNED inventory (used + L/Certified) from the
 * official dealer.com site, then reads each VDP for equipment. Skips new
 * inventory and any vehicle without both a price and photos. Writes packs.json.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import {
  DEALER,
  MIN_PHOTOS,
  PREOWNED_SOURCES,
  NEW_INVENTORY_PAGE,
  dedupeVehicles,
  extractInventoryApiUrl,
  extractTotalCount,
  isListable,
  isNewVehicle,
  toPack,
  vehiclesFromListingHtml,
} from "./dealer-inventory.mjs";

function vdpFeatureExtractor() {
  const out = new Set();
  const add = (s) => {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s && s.length >= 3 && s.length <= 60) out.add(s);
  };
  document.querySelectorAll("li").forEach((li) => {
    if (!li.querySelector("a,button,input,img,svg")) add(li.textContent);
  });
  document.querySelectorAll('[class*="feature"],[class*="equipment"],[class*="option"],[class*="spec"]').forEach((n) => {
    if (n.children.length === 0) add(n.textContent);
  });
  return [...out];
}

function buildKeyEquipment(sources, pack) {
  const hay = (sources || []).join("  •  ");
  const has = (re) => re.test(hay);
  const picks = [];
  const taken = new Set();
  const add = (label, ...flags) => {
    const k = label.toLowerCase();
    if (taken.has(k)) return;
    taken.add(k);
    for (const f of flags) taken.add(f);
    picks.push(label);
  };

  if (has(/\bmassage/i)) add("Massage Seats", "seatcomfort");
  if (!taken.has("seatcomfort") && has(/climate.?controlled.*seat|climate controlled front/i)) add("Climate-Controlled Seats", "seatcomfort");
  if (!taken.has("seatcomfort") && has(/ventilated (front )?seat|cooled (front )?seat|air.?conditioned seat/i)) add("Ventilated Front Seats", "seatcomfort");
  if (has(/heated steering/i)) add("Heated Steering Wheel");
  if (has(/around view|surround view|\b360|bird.?eye|intelligent around|multi.?view camera/i)) add("360° Camera", "camera");
  if (has(/\bbose\b/i)) add("Bose Premium Audio", "audio");
  else if (has(/mark levinson/i)) add("Mark Levinson Audio", "audio");
  else if (has(/harman.?kardon/i)) add("Harman Kardon Audio", "audio");
  else if (has(/lexicon/i)) add("Lexicon Premium Audio", "audio");
  if (has(/panoramic (sun|moon)roof|dual.?pane (sun|moon)roof|panoramic roof/i)) add("Panoramic Moonroof", "roof");
  if (has(/semi-aniline|nappa|quilted/i)) add("Premium Leather", "leather");
  if (has(/head-?up display|\bhud\b/i)) add("Head-Up Display");
  if (has(/adaptive cruise|propilot|pro pilot|highway driving assist/i)) add("Adaptive Cruise Control");
  if (has(/second row captain|2nd row captain|captain'?s chair/i)) add("Captain’s Chairs");

  if (!taken.has("seatcomfort") && has(/heated (front )?seat/i)) add("Heated Seats", "seatcomfort");
  if (has(/apple carplay|android auto|\bcarplay\b/i)) add("Apple CarPlay / Android Auto");
  if (has(/blind spot|blind-spot/i)) add("Blind Spot Monitor");
  if (!taken.has("roof") && has(/moonroof|sunroof/i)) add("Moonroof", "roof");
  if (!taken.has("audio") && has(/premium audio/i)) add("Premium Audio", "audio");
  if (!taken.has("leather") && has(/leather(-| )appointed|leather seat|leather interior/i)) add("Leather Seats", "leather");
  if (has(/navigation/i)) add("Navigation");
  if (has(/power liftgate|hands-?free liftgate|power tailgate/i)) add("Power Liftgate");
  if (has(/remote start/i)) add("Remote Start");
  if (has(/third row|3rd row/i)) add("Third-Row Seating");
  if (has(/power (front |driver )?seat/i)) add("Power Seats");
  if (!taken.has("camera") && has(/backup camera|rear ?view camera|rear camera/i)) add("Backup Camera", "camera");
  const dt = String(pack.drivetrain || "");
  if (/\b(4wd|4x4|four-wheel)\b/i.test(dt)) add("4WD");
  else if (/\b(awd|all-wheel)\b/i.test(dt)) add("AWD");

  return picks.slice(0, 6);
}

async function fetchInventoryApi(page, apiPath) {
  if (!apiPath) return [];
  return page.evaluate(async (apiPath) => {
    const all = [];
    const pageSize = 24;
    let start = 0;
    for (let n = 0; n < 40; n++) {
      const url = `${apiPath}${apiPath.includes("?") ? "&" : "?"}start=${start}&pageSize=${pageSize}`;
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) break;
      const j = await r.json();
      const list = (j && (j.inventory || j.listings || j.vehicles)) || [];
      const usable = list.filter((v) => v && !v.isPlaceholder);
      if (!usable.length) break;
      all.push(...usable);
      const total = Number(j?.pageInfo?.totalCount) || 0;
      start += pageSize;
      if (all.length >= total && total > 0) break;
      if (usable.length < pageSize) break;
    }
    return all;
  }, apiPath);
}

async function pullNonLexusMakes(page, listingUrl) {
  const extra = [];
  let makes = [];
  try {
    makes = await page.$$eval('input[name="make"]', (inputs) =>
      inputs.map((i) => i.value).filter((v) => v && !/^lexus$/i.test(v))
    );
  } catch {
    makes = [];
  }
  for (const make of makes) {
    try {
      const url = `${listingUrl}${listingUrl.includes("?") ? "&" : "?"}make=${encodeURIComponent(make)}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      const html = await page.content();
      if (html.length < 5000) continue;
      extra.push(...vehiclesFromListingHtml(html));
    } catch {
      /* Akamai often 429s extra facet pages from datacenter IPs */
    }
  }
  return extra;
}

async function pullSource(page, source) {
  await page.goto(source.page, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  let html = await page.content();
  if (/too many requests|access denied|attention required|cloudflare/i.test(html) && html.length < 5000) {
    throw new Error(`${source.name}: blocked fetching ${source.page}`);
  }

  const api = extractInventoryApiUrl(html);
  let vehicles = [];
  if (api) {
    try {
      vehicles = await fetchInventoryApi(page, api);
    } catch {
      vehicles = [];
    }
  }
  if (!vehicles.length) vehicles = vehiclesFromListingHtml(html);

  const total = extractTotalCount(html) || vehicles.length;
  const pageSize = 24;
  if (vehicles.length < total) {
    for (let start = vehicles.length; start < total && start < 24 * 40; start += pageSize) {
      const sep = source.page.includes("?") ? "&" : "?";
      await page.goto(`${source.page}${sep}start=${start}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      html = await page.content();
      const more = vehiclesFromListingHtml(html);
      if (!more.length) break;
      vehicles.push(...more);
    }
  }

  if (/used-inventory/i.test(source.page)) {
    const extra = await pullNonLexusMakes(page, source.page);
    if (extra.length) {
      console.log(`${source.name}: extra non-Lexus from make filters=${extra.length}`);
      vehicles.push(...extra);
    }
  }

  const newish = vehicles.filter(isNewVehicle).length;
  console.log(
    `${source.name}: pulled=${vehicles.length} listedTotal=${total} newSkipped=${newish} api=${api || "html"}`
  );
  return vehicles;
}

async function enrichFromVdps(ctx, packs) {
  const CONCURRENCY = 4;
  let idx = 0;
  let ok = 0;
  async function worker() {
    const page = await ctx.newPage();
    while (idx < packs.length) {
      const pk = packs[idx++];
      let feats = [];
      if (pk.vdpUrl) {
        try {
          await page.goto(pk.vdpUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(700);
          feats = await page.evaluate(vdpFeatureExtractor);
          if (feats.length) ok++;
        } catch {
          /* keep listing features as the source */
        }
      }
      pk.keyEquipment = buildKeyEquipment([...(feats || []), ...(pk.features || [])], pk);
      if (feats.length) pk.features = [...(pk.features || []), ...feats];
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`VDP equipment read for ${ok}/${packs.length} vehicles`);
}

async function assertNotScrapingNew(page) {
  try {
    await page.goto(NEW_INVENTORY_PAGE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);
    const html = await page.content();
    const newCount = extractTotalCount(html);
    if (newCount) console.log(`new-inventory page reports ${newCount} units (excluded from packs.json)`);
  } catch {
    console.log("new-inventory page not fetched (exclusion still enforced by type/URL filters)");
  }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  const pulled = [];
  const errors = [];
  for (const source of PREOWNED_SOURCES) {
    try {
      pulled.push(...(await pullSource(page, source)));
    } catch (e) {
      errors.push(`${source.name}: ${e.message || e}`);
      console.error(e);
    }
  }

  await assertNotScrapingNew(page);
  await page.close();

  const vehicles = dedupeVehicles(pulled).filter((v) => isListable(v, { minPhotos: MIN_PHOTOS }));
  console.log(`preowned+price+photos=${vehicles.length} (from ${pulled.length} pulled)`);
  if (!vehicles.length) {
    await browser.close();
    throw new Error(
      `No Lexus of Brookfield pre-owned vehicles — aborting so we don't publish an empty or old-dealer file.${
        errors.length ? " " + errors.join("; ") : ""
      }`
    );
  }

  const packs = vehicles.map(toPack);
  if (packs.some((p) => /lake country|boucher|nissanlakecountry|hyundailakecountry/i.test(p.rooftop + p.vdpUrl))) {
    await browser.close();
    throw new Error("Refusing to write old-dealership URLs into packs.json");
  }
  if (packs.some((p) => p.condition === "NEW" || /\/new\/|\/electric-new\//i.test(p.vdpUrl))) {
    await browser.close();
    throw new Error("New inventory leaked into packs — aborting");
  }

  await enrichFromVdps(ctx, packs);
  await browser.close();

  if (packs.length < 10) {
    throw new Error(`Only ${packs.length} pre-owned vehicles — suspiciously low, aborting`);
  }

  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync("packs.json", "utf8")).packs || [];
  } catch {}
  const nowStocks = new Set(packs.map((p) => p.stock));
  const sold = previous
    .filter((p) => p.condition !== "NEW" && !nowStocks.has(p.stock))
    .filter((p) => /lexus of brookfield|lexusofbrookfield/i.test([p.rooftop, p.vdpUrl].join(" ")))
    .map((p) => ({
      stock: p.stock,
      vin: p.vin,
      vehicle: [p.year, p.make, p.model, p.trim].filter(Boolean).join(" "),
      rooftop: p.rooftop,
      lastPrice: p.price,
    }));

  const out = {
    generatedAt: new Date().toISOString(),
    source: "lexusofbrookfield.com dealer.com used + L/Certified (PRE-OWNED only, price+photos)",
    dealer: DEALER.name,
    site: DEALER.site,
    count: packs.length,
    soldSinceLast: sold.length,
    sold,
    packs,
  };
  fs.writeFileSync("packs.json", JSON.stringify(out));
  console.log(
    `Wrote packs.json — ${packs.length} pre-owned, ${sold.length} sold since last run, ${(
      fs.statSync("packs.json").size / 1024 / 1024
    ).toFixed(2)} MB`
  );
  if (sold.length) console.log("SOLD/removed:\n" + sold.map((s) => "  - " + s.stock + "  " + s.vehicle).join("\n"));
  if (errors.length) console.log("Source warnings:\n" + errors.map((e) => "  - " + e).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
