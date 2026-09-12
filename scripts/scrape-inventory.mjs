/**
 * Lot Linker Fill — weekly inventory scraper.
 * Pulls the Boucher Lake Country Hyundai + Nissan rooftops from the Cars Commerce
 * listings API, then reads each vehicle's detail page (VDP) for its real, trim-
 * specific equipment and writes a premium-first `keyEquipment` list. Skips any
 * vehicle without both a price and photos. Writes packs.json; the workflow
 * commits it when it changes.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const ROOFTOPS = [
  {
    site: "https://www.hyundailakecountry.com/new-vehicles/",
    rooftop: "Lake Country Hyundai",
    facetFilters: { custom_text_5: ["Boucher Hyundai of Lake Country"] },
  },
  {
    site: "https://www.nissanlakecountry.com/new-vehicles/",
    rooftop: "Lake Country Nissan",
    facetFilters: null,
  },
];

const REQUESTED_FIELDS = [
  "vin", "stock", "type", "year", "make", "model", "trim", "mileage", "features",
  "vdp_url", "body_details", "styles", "mechanical", "pricing", "media", "status",
];

async function pullSite(page, url, facetFilters) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => window.SEARCH_SERVICE && window.SEARCH_SERVICE.apiKey && window.SEARCH_SERVICE.search,
    null,
    { timeout: 45000 }
  );
  return page.evaluate(
    async ({ facetFilters, RF }) => {
      const svc = window.SEARCH_SERVICE;
      const endpoint = svc.search + "/search";
      const H = { "Content-Type": "application/json", "x-api-key": svc.apiKey };
      const num = (n) => { n = Number(n); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
      const pickPrice = (p) => { p = p || {}; return num(p.internet_price) || num(p.price) || num(p.our_price) || num(p.msrp) || 0; };
      const compact = (v) => {
        const m = v.mechanical || {}, s = v.styles || {}, b = v.body_details || {}, p = v.pricing || {}, md = v.media || {};
        return {
          vin: v.vin, stock: v.stock, type: v.type, year: v.year, make: v.make, model: v.model, trim: v.trim,
          mileage: v.mileage, vdpUrl: v.vdp_url, drivetrain: m.drivetrain, fuel: m.fuel_type,
          transmission: m.transmission, engine: m.engine, exterior: s.exterior_color, interior: s.interior_color,
          extGen: s.exterior_color_generic, intGen: s.interior_color_generic, bodyType: b.type || b.generic_type,
          price: pickPrice(p), features: Array.isArray(v.features) ? v.features : [],
          photoUrls: Array.isArray(md.images) ? md.images.slice(0, 20) : [],
        };
      };
      let page = 1, all = [], total = Infinity;
      while (all.length < total && page <= 40) {
        const body = { page, perPage: 100, filters: { status: ["publish", "modified", "pend-sale"] }, requestedFields: RF };
        if (facetFilters) body.facetFilters = facetFilters;
        const r = await fetch(endpoint, { method: "POST", headers: H, body: JSON.stringify(body) });
        if (!r.ok) throw new Error("API " + r.status);
        const j = await r.json();
        total = j.meta.pagination.total;
        const list = (j.data && j.data.listings) || [];
        if (!list.length) break;
        all.push(...list.map(compact));
        page++;
      }
      return { total, recs: all };
    },
    { facetFilters, RF: REQUESTED_FIELDS }
  );
}

// Pull the real equipment strings off a VDP (list items + feature/spec leaf nodes).
function vdpFeatureExtractor() {
  const out = new Set();
  const add = (s) => {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s && s.length >= 3 && s.length <= 60) out.add(s);
  };
  document.querySelectorAll("li").forEach((li) => { if (!li.querySelector("a,button,input,img,svg")) add(li.textContent); });
  document.querySelectorAll('[class*="feature"],[class*="equipment"],[class*="option"],[class*="spec"]').forEach((n) => {
    if (n.children.length === 0) add(n.textContent);
  });
  return [...out];
}

// Rank equipment premium-first so loaded trims lead with their good stuff and
// base trims show standard gear. Returns up to 6 clean, buyer-friendly bullets.
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

  // --- premium / trim-distinguishing ---
  if (has(/\bmassage/i)) add("Massage Seats", "seatcomfort");
  if (!taken.has("seatcomfort") && has(/climate.?controlled.*seat|climate controlled front/i)) add("Climate-Controlled Seats", "seatcomfort");
  if (!taken.has("seatcomfort") && has(/ventilated (front )?seat|cooled (front )?seat|air.?conditioned seat/i)) add("Ventilated Front Seats", "seatcomfort");
  if (has(/heated steering/i)) add("Heated Steering Wheel");
  if (has(/around view|surround view|\b360|bird.?eye|intelligent around|multi.?view camera/i)) add("360° Camera", "camera");
  if (has(/\bbose\b/i)) add("Bose Premium Audio", "audio");
  else if (has(/harman.?kardon/i)) add("Harman Kardon Audio", "audio");
  if (has(/panoramic (sun|moon)roof|dual.?pane (sun|moon)roof|panoramic roof/i)) add("Panoramic Moonroof", "roof");
  if (has(/semi-aniline|nappa|quilted/i)) add("Premium Leather", "leather");
  if (has(/head-?up display|\bhud\b/i)) add("Head-Up Display");
  if (has(/adaptive cruise|propilot|pro pilot|highway driving assist/i)) add("Adaptive Cruise Control");
  if (has(/second row captain|2nd row captain|captain'?s chair/i)) add("Captain’s Chairs");

  // --- standard ---
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

const tc = (s) => String(s || "").trim().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
function cleanFuel(f) {
  const t = String(f || "").toLowerCase();
  if (/electric/.test(t) && !/hybrid/.test(t)) return "Electric";
  if (/plug-?in|phev/.test(t)) return "Plug-in hybrid";
  if (/hybrid/.test(t)) return "Hybrid";
  if (/diesel/.test(t)) return "Diesel";
  if (/flex|e85/.test(t)) return "Flex";
  if (/hydrogen|fuel cell/.test(t)) return "Hydrogen";
  return "Gasoline";
}
function cleanBody(b) {
  const t = String(b || "").toLowerCase();
  if (/suv|sport utility|crossover/.test(t)) return "SUV";
  if (/truck|pickup|cab/.test(t)) return "Truck";
  if (/sedan/.test(t)) return "Sedan";
  if (/coupe/.test(t)) return "Coupe";
  if (/hatch/.test(t)) return "Hatchback";
  if (/minivan|van/.test(t)) return "Minivan";
  if (/wagon/.test(t)) return "Wagon";
  if (/convertible/.test(t)) return "Convertible";
  return String(b || "").trim();
}
function toPack(r, rooftop) {
  const make = tc(r.make), model = tc(r.model), bodyStyle = cleanBody(r.bodyType);
  const miles = Number(r.mileage) || 0;
  return {
    stock: r.stock, year: String(r.year || ""), make, model, trim: r.trim || "", bodyStyle,
    mileage: String(miles), vin: r.vin, condition: /new/i.test(r.type) ? "NEW" : "USED",
    exterior: r.exterior || "", interior: r.interior || "", transmission: r.transmission || "",
    fuel: cleanFuel(r.fuel), drivetrain: r.drivetrain || "", engine: r.engine || "",
    titleStatus: "Title Clean", zip: "53066", price: r.price > 0 ? String(r.price) : "",
    title: [r.year, make, model, r.trim, bodyStyle].filter(Boolean).join(" "), rooftop,
    photoUrls: Array.isArray(r.photoUrls) ? r.photoUrls : [], odometerMiles: miles, vdpUrl: r.vdpUrl || "",
    interiorName: r.interior || "", interiorFb: r.intGen || "", exteriorFb: r.extGen || "",
    photoUrlCount: Array.isArray(r.photoUrls) ? r.photoUrls.length : 0,
    features: Array.isArray(r.features) ? r.features : [], keyEquipment: [], type: r.type,
  };
}

// Read every vehicle's VDP (a few in parallel) and set pack.keyEquipment.
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
          /* keep API features as the source */
        }
      }
      pk.keyEquipment = buildKeyEquipment([...(feats || []), ...(pk.features || [])], pk);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`VDP equipment read for ${ok}/${packs.length} vehicles`);
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  const packs = [];
  for (const rt of ROOFTOPS) {
    const { total, recs } = await pullSite(page, rt.site, rt.facetFilters);
    const listable = recs.filter((r) => r.price > 0 && Array.isArray(r.photoUrls) && r.photoUrls.length > 0);
    console.log(`${rt.rooftop}: total=${total} pulled=${recs.length} listable(price+photos)=${listable.length}`);
    if (!recs.length) throw new Error(`No vehicles pulled for ${rt.rooftop} — aborting so we don't publish an empty file`);
    packs.push(...listable.map((r) => toPack(r, rt.rooftop)));
  }
  await page.close();

  await enrichFromVdps(ctx, packs);
  await browser.close();

  if (packs.length < 30) throw new Error(`Only ${packs.length} listable vehicles — suspiciously low, aborting`);
  const out = {
    generatedAt: new Date().toISOString(),
    source: "carscommerce websites-search API + VDP equipment (Lake Country rooftops, price+photos only)",
    count: packs.length,
    packs,
  };
  fs.writeFileSync("packs.json", JSON.stringify(out));
  console.log(`Wrote packs.json — ${packs.length} vehicles, ${(fs.statSync("packs.json").size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
