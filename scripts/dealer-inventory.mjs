/**
 * Lexus of Brookfield dealer.com inventory helpers.
 * Used by the weekly scraper and Node regression tests. Not loaded by the extension.
 *
 * Public sources (verified 2026-11-07):
 *   https://www.lexusofbrookfield.com/
 *   https://www.lexusofbrookfield.com/used-inventory/index.htm
 *   https://www.lexusofbrookfield.com/l-certified-inventory/index.htm
 *   JSON-LD AutoDealer: 20001 W Bluemound Rd, Brookfield, WI 53045, +12623204619
 */
export const DEALER = {
  name: "Lexus of Brookfield",
  site: "https://www.lexusofbrookfield.com",
  city: "Brookfield",
  state: "WI",
  zip: "53045",
  address: "20001 W Bluemound Rd",
  phone: "262-320-4619",
  accountId: "lexusofbrookfieldwi",
};

export const PREOWNED_SOURCES = [
  {
    name: "used",
    page: `${DEALER.site}/used-inventory/index.htm`,
  },
  {
    name: "cpo",
    page: `${DEALER.site}/l-certified-inventory/index.htm`,
  },
];

export const NEW_INVENTORY_PAGE = `${DEALER.site}/new-inventory/index.htm`;

export const MIN_PHOTOS = 4;
export const MAX_PHOTOS = 20;

const OLD_DEALER_RE =
  /nissanlakecountry|hyundailakecountry|\bboucher\b|lake country nissan|lake country hyundai|oconomowoc/i;
const CURRENT_DEALER_RE = /lexus of brookfield|lexusofbrookfield/i;
const NEW_PATH_RE = /\/new\/|\/electric-new\/|\/new-inventory\//i;
const CERT_PATH_RE = /\/certified\/|\/electric-certified\/|\/l-certified-inventory\//i;

export function text(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

export function titleCaseName(s) {
  return text(s)
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function prettyMake(s) {
  const t = text(s);
  if (!t) return "";
  if (/[a-z]/.test(t)) return t;
  if (/^(BMW|GMC|RAM|MINI|FIAT)$/i.test(t)) return t.toUpperCase() === "MINI" ? "MINI" : t.toUpperCase();
  return titleCaseName(t);
}

export function prettyModel(s) {
  const t = text(s);
  if (!t) return "";
  if (/[a-z]/.test(t) && /[A-Z]/.test(t)) return t;
  if (/^[A-Z]{2,3}$/.test(t)) return t;
  if (/^[A-Z]{1,3}\d/.test(t)) return t;
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) return t;
  return titleCaseName(t);
}

export function num(v) {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function attrList(vehicle) {
  return [...(vehicle?.attributes || []), ...(vehicle?.trackingAttributes || []), ...(vehicle?.highlightedAttributes || [])];
}

export function attr(vehicle, name) {
  const hit = attrList(vehicle).find((a) => a && a.name === name);
  return hit ? text(hit.value) : "";
}

export function attrNormalized(vehicle, name) {
  const hit = attrList(vehicle).find((a) => a && a.name === name);
  return hit ? text(hit.normalizedValue || hit.value) : "";
}

export function pickPrice(vehicle) {
  const dprice = vehicle?.pricing?.dprice;
  if (Array.isArray(dprice)) {
    const asking = dprice.find((x) => x?.typeClass === "askingPrice");
    if (asking) {
      const n = num(asking.value);
      if (n) return n;
    }
  }
  const tp = vehicle?.trackingPricing || {};
  return num(tp.askingPrice) || num(vehicle?.pricing?.retailPrice) || num(tp.salePrice) || 0;
}

export function photoUrls(vehicle) {
  const imgs = Array.isArray(vehicle?.images) ? vehicle.images : [];
  const actual = imgs.filter((i) => i?.uri && i.provider === "ACTUAL_PHOTO");
  const src = actual.length ? actual : imgs.filter((i) => i?.uri);
  const out = [];
  const seen = new Set();
  for (const img of src) {
    const u = String(img.uri).split("#")[0];
    if (!/^https:\/\//i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export function vdpUrl(vehicle) {
  const link = text(vehicle?.link || vehicle?.url);
  if (!link) return "";
  if (/^https:\/\//i.test(link)) return link;
  if (link.startsWith("/")) return `${DEALER.site}${link}`;
  return "";
}

export function isNewVehicle(vehicle) {
  const type = text(vehicle?.type).toLowerCase();
  const cond = text(vehicle?.condition).toLowerCase();
  const link = text(vehicle?.link || vehicle?.url);
  if (type === "new") return true;
  if (cond === "new") return true;
  if (NEW_PATH_RE.test(link)) return true;
  return false;
}

export function isCertified(vehicle) {
  if (vehicle?.certified === true) return true;
  if (/certified/i.test(text(vehicle?.condition))) return true;
  if (CERT_PATH_RE.test(text(vehicle?.link || vehicle?.url))) return true;
  if (/l\/?certified|certified pre-owned/i.test(text(vehicle?.title))) return true;
  return false;
}

export function isPreownedListing(vehicle) {
  if (!vehicle) return false;
  if (isNewVehicle(vehicle)) return false;
  const stock = text(vehicle.stockNumber || attr(vehicle, "stockNumber"));
  const vin = text(vehicle.vin);
  return Boolean(stock || vin);
}

export function isListable(vehicle, { minPhotos = MIN_PHOTOS, requirePrice = true } = {}) {
  if (!isPreownedListing(vehicle)) return false;
  if (requirePrice && !pickPrice(vehicle)) return false;
  if (photoUrls(vehicle).length < minPhotos) return false;
  return true;
}

export function cleanDrive(raw) {
  const t = text(raw);
  if (/\b4wd\b|\b4x4\b|four-wheel/i.test(t)) return "4WD";
  if (/\bawd\b|all-?wheel/i.test(t)) return "AWD";
  if (/front-?wheel|\bfwd\b/i.test(t)) return "FWD";
  if (/rear-?wheel|\brwd\b/i.test(t)) return "RWD";
  return t;
}

export function cleanFuel(f) {
  const t = text(f).toLowerCase();
  if (/electric/.test(t) && !/hybrid/.test(t)) return "Electric";
  if (/plug-?in|phev/.test(t)) return "Plug-in hybrid";
  if (/hybrid/.test(t)) return "Hybrid";
  if (/diesel/.test(t)) return "Diesel";
  if (/flex|e85/.test(t)) return "Flex";
  if (/hydrogen|fuel cell/.test(t)) return "Hydrogen";
  return "Gasoline";
}

export function cleanBody(b) {
  const t = text(b).toLowerCase();
  if (/suv|sport utility|crossover/.test(t)) return "SUV";
  if (/truck|pickup|cab/.test(t)) return "Truck";
  if (/sedan/.test(t)) return "Sedan";
  if (/coupe/.test(t)) return "Coupe";
  if (/hatch/.test(t)) return "Hatchback";
  if (/minivan|van/.test(t)) return "Minivan";
  if (/wagon/.test(t)) return "Wagon";
  if (/convertible/.test(t)) return "Convertible";
  return text(b);
}

function jsonValue(html, key) {
  const m = String(html || "").match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return m ? m[1] : "";
}

export function extractInventoryApiUrl(html) {
  return jsonValue(html, "inventoryApiURL");
}

export function extractTotalCount(html) {
  const raw = String(html || "");
  let best = 0;
  for (const m of raw.matchAll(/"pageInfo"\s*:\s*\{[^}]{0,400}?"totalCount"\s*:\s*(\d+)/g)) {
    best = Math.max(best, Number(m[1]) || 0);
  }
  if (best) return best;
  const ld = raw.match(/Browse our inventory of\s+(\d+)/i);
  return ld ? Number(ld[1]) || 0 : 0;
}

export function extractMakeFacets(html) {
  const raw = String(html || "");
  const idx = raw.search(/"id"\s*:\s*"make"\s*,\s*"label"\s*:\s*"Make"/);
  if (idx < 0) return [];
  const valuesAt = raw.indexOf('"values":', idx);
  if (valuesAt < 0) return [];
  const arr = extractJsonArrayAt(raw, valuesAt);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v) => v && v.value && v.type === "BASIC")
    .map((v) => ({
      value: text(v.value),
      make: prettyMake(v.value) || text(v.value),
      label: text(v.label || v.value),
      count: Number(v.count) || 0,
    }));
}

export function extractNextListingUrls(html, site = DEALER.site) {
  const raw = String(html || "");
  const out = [];
  const seen = new Set();
  const add = (href) => {
    if (!href) return;
    const url = href.startsWith("http") ? href : `${site}${href.startsWith("/") ? "" : "/"}${href}`;
    if (!/used-inventory|l-certified-inventory|certified-inventory/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  const next = raw.match(/rel=["']next["']\s+href=["']([^"']+)["']/i) || raw.match(/href=["']([^"']+)["']\s+rel=["']next["']/i);
  if (next) add(next[1]);
  for (const m of raw.matchAll(/href=["']([^"']*start=\d+[^"']*)["']/gi)) add(m[1]);
  return out;
}

export function makeFacetTotal(facets) {
  return (facets || []).reduce((n, f) => n + (Number(f.count) || 0), 0);
}

export function makeBreakdown(vehicles) {
  const counts = {};
  for (const v of vehicles || []) {
    const make = prettyMake(v.make) || text(v.make) || "Unknown";
    counts[make] = (counts[make] || 0) + 1;
  }
  return counts;
}

export function collectionComplete({ expectedTotal, uniqueCount }) {
  const expected = Number(expectedTotal) || 0;
  const got = Number(uniqueCount) || 0;
  return expected > 0 && got >= expected;
}

export function shouldWritePacks({ complete, previousCount = 0, newCount = 0 }) {
  if (complete) return { write: true, reason: "complete vs site total" };
  if (previousCount > 0 && newCount < previousCount) {
    return { write: false, reason: "partial collection would replace a larger existing bundle" };
  }
  return { write: false, reason: "incomplete vs site total; keeping previous packs.json" };
}

export function extractPreownedSitemapUrls(html, site = DEALER.site) {
  const hrefs = String(html || "").match(/href=['"]([^'"]+)['"]/gi) || [];
  const out = [];
  const seen = new Set();
  for (const raw of hrefs) {
    const m = raw.match(/href=['"]([^'"]+)['"]/i);
    const href = m ? m[1] : "";
    if (!/(?:\/used\/|\/certified\/|\/electric-certified\/)/i.test(href)) continue;
    if (/\/new\/|\/electric-new\//i.test(href)) continue;
    const url = href.startsWith("http") ? href : `${site}${href.startsWith("/") ? "" : "/"}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function extractJsonArrayAt(raw, startHint) {
  const i = raw.indexOf("[", startHint);
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < raw.length; j++) {
    const ch = raw[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function extractEmbeddedInventory(html) {
  const raw = String(html || "");
  const needle = '"inventory":[{"inventoryButtons"';
  const idx = raw.indexOf(needle);
  if (idx >= 0) {
    const arr = extractJsonArrayAt(raw, idx);
    if (Array.isArray(arr) && arr.length) return arr.filter((v) => v && !v.isPlaceholder);
  }
  return [];
}

export function extractJsonLdVehicles(html) {
  const raw = String(html || "");
  const blocks = [...raw.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const out = [];
  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const offered = data?.about?.offers?.itemOffered;
    if (!Array.isArray(offered)) continue;
    for (const o of offered) out.push(fromJsonLdCar(o));
  }
  return out;
}

export function fromJsonLdCar(o) {
  const url = text(o?.url);
  const miles = o?.mileageFromOdometer?.value;
  const image = typeof o?.image === "string" ? o.image : "";
  return {
    vin: text(o?.vehicleIdentificationNumber),
    stockNumber: text(o?.sku),
    year: o?.vehicleModelDate,
    make: text(o?.brand?.name || o?.manufacturer?.name),
    model: text(o?.model),
    link: url.replace(DEALER.site, "") || url,
    type: NEW_PATH_RE.test(url) ? "new" : "used",
    certified: /certified/i.test(text(o?.name)) || CERT_PATH_RE.test(url),
    condition: /certified/i.test(text(o?.name)) ? "Certified Pre-Owned" : "Used",
    bodyStyle: "",
    fuelType: text(o?.fuelType),
    pricing: { retailPrice: o?.offers?.price },
    trackingPricing: { askingPrice: o?.offers?.price },
    images: image ? [{ uri: image, provider: "ACTUAL_PHOTO" }] : [],
    trackingAttributes: [
      { name: "odometer", value: miles != null ? String(miles) : "" },
      { name: "driveLine", value: text(o?.driveWheelConfiguration) },
      { name: "transmission", value: text(o?.vehicleTransmission) },
      { name: "engine", value: text(o?.vehicleEngine) },
      { name: "exteriorColor", value: text(o?.color) },
      { name: "interiorColor", value: text(o?.vehicleInteriorColor) },
    ],
    title: [text(o?.name)],
  };
}

export function vehiclesFromListingHtml(html) {
  const embedded = extractEmbeddedInventory(html);
  if (embedded.length) return embedded;
  return extractJsonLdVehicles(html);
}

export function isCurrentDealerPack(pack) {
  const hay = [pack?.rooftop, pack?.vdpUrl, pack?.source].join(" ");
  if (OLD_DEALER_RE.test(hay)) return false;
  return CURRENT_DEALER_RE.test(hay);
}

export function rejectOldDealerPacks(packs) {
  return (Array.isArray(packs) ? packs : []).filter(isCurrentDealerPack);
}

export function toPack(vehicle) {
  const make = prettyMake(vehicle.make);
  const model = prettyModel(vehicle.model);
  const trim = text(vehicle.trim);
  const bodyStyle = cleanBody(vehicle.bodyStyle || attr(vehicle, "bodyStyle"));
  const miles = num(attr(vehicle, "odometer") || vehicle.odometer);
  const certified = isCertified(vehicle);
  const photos = photoUrls(vehicle);
  const price = pickPrice(vehicle);
  const stock = text(vehicle.stockNumber || attr(vehicle, "stockNumber"));
  const url = vdpUrl(vehicle);
  const drive = cleanDrive(attr(vehicle, "driveLine") || vehicle.driveLine || vehicle.drivetrain);
  const fuel = cleanFuel(attr(vehicle, "normalFuelType") || vehicle.fuelType || attr(vehicle, "fuelType"));
  return {
    stock,
    year: String(vehicle.year || ""),
    make,
    model,
    trim,
    bodyStyle,
    mileage: String(miles || 0),
    vin: text(vehicle.vin),
    condition: certified ? "CPO" : "USED",
    certified,
    exterior: attr(vehicle, "exteriorColor"),
    interior: attr(vehicle, "interiorColor"),
    transmission: attr(vehicle, "transmission") || text(vehicle.transmission),
    fuel,
    drivetrain: drive,
    engine: "",
    titleStatus: "Title Clean",
    zip: DEALER.zip,
    price: price > 0 ? String(price) : "",
    title: [vehicle.year, make, model, trim, bodyStyle].filter(Boolean).join(" "),
    rooftop: DEALER.name,
    photoUrls: photos,
    odometerMiles: miles,
    vdpUrl: url,
    interiorName: attr(vehicle, "interiorColor"),
    interiorFb: attrNormalized(vehicle, "interiorColor"),
    exteriorFb: attrNormalized(vehicle, "exteriorColor"),
    photoUrlCount: photos.length,
    features: Array.isArray(vehicle.features) ? vehicle.features : [],
    keyEquipment: [],
    type: certified ? "certified" : "used",
  };
}

export function dedupeVehicles(vehicles) {
  const out = [];
  const seenVin = new Set();
  const seenStock = new Set();
  for (const v of vehicles || []) {
    const vin = text(v.vin).toUpperCase();
    const stock = text(v.stockNumber || attr(v, "stockNumber")).toUpperCase();
    if (vin && seenVin.has(vin)) continue;
    if (stock && seenStock.has(stock)) continue;
    if (vin) seenVin.add(vin);
    if (stock) seenStock.add(stock);
    out.push(v);
  }
  return out;
}
