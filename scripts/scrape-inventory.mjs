/**
 * Lot Linker Fill — weekly inventory scraper.
 * Pulls the Boucher Lake Country Hyundai + Nissan rooftops from the Cars Commerce
 * listings API and writes packs.json. Uses a real (Playwright) browser only to read
 * each site's public search key from window.SEARCH_SERVICE, then calls the API in-page.
 * Runs in GitHub Actions; the workflow commits packs.json when it changes.
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
    features: Array.isArray(r.features) ? r.features : [], type: r.type,
  };
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
    console.log(`${rt.rooftop}: total=${total} pulled=${recs.length}`);
    if (!recs.length) throw new Error(`No vehicles pulled for ${rt.rooftop} — aborting so we don't publish an empty file`);
    packs.push(...recs.map((r) => toPack(r, rt.rooftop)));
  }
  await browser.close();
  if (packs.length < 50) throw new Error(`Only ${packs.length} vehicles — suspiciously low, aborting`);
  const out = { generatedAt: new Date().toISOString(), source: "carscommerce websites-search API (Lake Country rooftops only)", count: packs.length, packs };
  fs.writeFileSync("packs.json", JSON.stringify(out));
  console.log(`Wrote packs.json — ${packs.length} vehicles, ${(fs.statSync("packs.json").size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
