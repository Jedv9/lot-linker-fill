/**
 * Lot Linker Fill — live used-inventory from lexusofbrookfield.com.
 * Source of truth for the lot: /used-inventory/index.htm (all result pages).
 * Marketplace price is still the VDP Total Sale Price, overlaid after collection.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerInventory = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SITE = "https://www.lexusofbrookfield.com";
  const USED_INVENTORY_PAGE = `${SITE}/used-inventory/index.htm`;
  const PAGE_SIZE = 24;
  const DEALER_NAME = "Lexus of Brookfield";
  const NEW_PATH_RE = /\/new\/|\/electric-new\/|\/new-inventory\//i;
  const CERT_PATH_RE = /\/certified\/|\/electric-certified\/|\/l-certified-inventory\//i;

  function text(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function titleCaseName(s) {
    return text(s)
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }

  function prettyMake(s) {
    const t = text(s);
    if (!t) return "";
    if (/[a-z]/.test(t)) return t;
    if (/^(BMW|GMC|RAM|MINI|FIAT)$/i.test(t)) return t.toUpperCase() === "MINI" ? "MINI" : t.toUpperCase();
    return titleCaseName(t);
  }

  function prettyModel(s) {
    const t = text(s);
    if (!t) return "";
    if (/[a-z]/.test(t) && /[A-Z]/.test(t)) return t;
    if (/^[A-Z]{2,3}$/.test(t)) return t;
    if (/^[A-Z]{1,3}\d/.test(t)) return t;
    if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) return t;
    return titleCaseName(t);
  }

  function num(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function attrList(vehicle) {
    return [...(vehicle?.attributes || []), ...(vehicle?.trackingAttributes || []), ...(vehicle?.highlightedAttributes || [])];
  }

  function attr(vehicle, name) {
    const hit = attrList(vehicle).find((a) => a && a.name === name);
    return hit ? text(hit.value) : "";
  }

  function listingUrl(base, { start, pageSize } = {}) {
    const u = new URL(base);
    if (start) u.searchParams.set("start", String(start));
    else u.searchParams.delete("start");
    if (pageSize) u.searchParams.set("pageSize", String(pageSize));
    return u.toString();
  }

  function extractJsonArrayAt(raw, startHint) {
    const i = String(raw || "").indexOf("[", startHint);
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

  function extractTotalCount(html) {
    const raw = String(html || "");
    let best = 0;
    for (const m of raw.matchAll(/"pageInfo"\s*:\s*\{[^}]{0,400}?"totalCount"\s*:\s*(\d+)/g)) {
      best = Math.max(best, Number(m[1]) || 0);
    }
    if (best) return best;
    const ld = raw.match(/Browse our inventory of\s+(\d+)/i);
    return ld ? Number(ld[1]) || 0 : 0;
  }

  function extractNextListingUrls(html, site = SITE) {
    const raw = String(html || "");
    const out = [];
    const seen = new Set();
    const add = (href) => {
      if (!href) return;
      const url = href.startsWith("http") ? href : `${site}${href.startsWith("/") ? "" : "/"}${href}`;
      if (!/used-inventory/i.test(url)) return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push(url);
    };
    const next = raw.match(/rel=["']next["']\s+href=["']([^"']+)["']/i) || raw.match(/href=["']([^"']+)["']\s+rel=["']next["']/i);
    if (next) add(next[1]);
    for (const m of raw.matchAll(/href=["']([^"']*start=\d+[^"']*)["']/gi)) add(m[1]);
    return out;
  }

  function extractEmbeddedInventory(html) {
    const raw = String(html || "");
    const needle = '"inventory":[{"inventoryButtons"';
    const idx = raw.indexOf(needle);
    if (idx >= 0) {
      const arr = extractJsonArrayAt(raw, idx);
      if (Array.isArray(arr) && arr.length) return arr.filter((v) => v && !v.isPlaceholder);
    }
    return [];
  }

  function vehiclesFromListingHtml(html) {
    return extractEmbeddedInventory(html);
  }

  function isNewVehicle(vehicle) {
    const type = text(vehicle?.type).toLowerCase();
    const cond = text(vehicle?.condition).toLowerCase();
    const link = text(vehicle?.link || vehicle?.url);
    if (type === "new") return true;
    if (cond === "new") return true;
    if (NEW_PATH_RE.test(link)) return true;
    return false;
  }

  function isPreownedListing(vehicle) {
    if (!vehicle || isNewVehicle(vehicle)) return false;
    const stock = text(vehicle.stockNumber || attr(vehicle, "stockNumber"));
    const vin = text(vehicle.vin);
    return Boolean(stock || vin);
  }

  function vdpUrl(vehicle) {
    const link = text(vehicle?.link || vehicle?.url);
    if (!link) return "";
    if (/^https:\/\//i.test(link)) return link;
    if (link.startsWith("/")) return `${SITE}${link}`;
    return "";
  }

  function listingPhotoUrls(vehicle) {
    const imgs = Array.isArray(vehicle?.images) ? vehicle.images : [];
    const actual = imgs.filter((i) => i?.uri && i.provider === "ACTUAL_PHOTO");
    const src = actual.length ? actual : imgs.filter((i) => i?.uri);
    const out = [];
    const seen = new Set();
    const branding = typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.isBrandingPhotoUrl
      ? LotLinkerPhotos.isBrandingPhotoUrl
      : (u) => /\/lexusprogram\/|\/logo|favicon/i.test(u);
    for (const img of src) {
      const u = String(img.uri).split("#")[0];
      if (!/^https:\/\//i.test(u)) continue;
      if (branding(u)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (out.length >= 20) break;
    }
    return out;
  }

  function listingToPack(vehicle) {
    const make = prettyMake(vehicle.make);
    const model = prettyModel(vehicle.model);
    const trim = text(vehicle.trim);
    const miles = num(attr(vehicle, "odometer") || vehicle.odometer);
    const certified = vehicle?.certified === true || CERT_PATH_RE.test(text(vehicle?.link || vehicle?.url));
    const stock = text(vehicle.stockNumber || attr(vehicle, "stockNumber"));
    const url = vdpUrl(vehicle);
    const photos = listingPhotoUrls(vehicle);
    return {
      stock,
      year: String(vehicle.year || ""),
      make,
      model,
      trim,
      mileage: String(miles || 0),
      vin: text(vehicle.vin),
      condition: certified ? "CPO" : "USED",
      certified,
      rooftop: DEALER_NAME,
      vdpUrl: url,
      photoUrls: photos,
      photoUrlCount: photos.length,
      odometerMiles: miles,
      title: [vehicle.year, make, model, trim].filter(Boolean).join(" "),
      zip: "53045",
      price: "",
      totalSalePrice: "",
      priceMissing: true,
      priceSource: "missing",
      priceIncludesDealerFees: false,
    };
  }

  function dedupeVehicles(vehicles) {
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

  function mergeLiveWithPrevious(previous, live) {
    const prevBy = new Map();
    for (const p of Array.isArray(previous) ? previous : []) {
      const k = text(p?.stock).toUpperCase();
      if (k) prevBy.set(k, p);
    }
    return (Array.isArray(live) ? live : []).map((row) => {
      const prev = prevBy.get(text(row.stock).toUpperCase());
      if (!prev) return row;
      return {
        ...prev,
        ...row,
        photoUrls: row.photoUrls?.length ? row.photoUrls : prev.photoUrls,
        features: prev.features || row.features,
        keyEquipment: prev.keyEquipment || row.keyEquipment,
        bodyStyle: row.bodyStyle || prev.bodyStyle,
        exterior: row.exterior || prev.exterior,
        interior: row.interior || prev.interior,
        drivetrain: row.drivetrain || prev.drivetrain,
        fuel: row.fuel || prev.fuel,
        engine: row.engine || prev.engine,
      };
    });
  }

  async function fetchListingHtml(url, { fetchFn, maxAttempts = 6 } = {}) {
    const doFetch = fetchFn || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) throw new Error("no fetch");
    let lastStatus = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await doFetch(url, {
        credentials: "omit",
        cache: "no-cache",
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      lastStatus = res.status;
      if (lastStatus === 403 || lastStatus === 401) {
        const err = new Error(`blocked fetching ${url} (HTTP ${lastStatus})`);
        err.blocked = true;
        err.status = lastStatus;
        throw err;
      }
      if (lastStatus === 429 || lastStatus === 503) {
        const ra = Number(typeof res.headers?.get === "function" ? res.headers.get("retry-after") : 0) || 0;
        const wait = ra > 0 ? ra * 1000 : Math.min(60000, 4000 * 2 ** attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${lastStatus} ${url}`);
        err.status = lastStatus;
        throw err;
      }
      return typeof res.text === "function" ? await res.text() : String(res.body || "");
    }
    const err = new Error(`blocked fetching ${url} (last HTTP ${lastStatus})`);
    err.status = lastStatus;
    throw err;
  }

  async function collectUsedInventory({
    fetchFn,
    onProgress,
    gapMs = 400,
    pageSize = PAGE_SIZE,
  } = {}) {
    const firstUrl = listingUrl(USED_INVENTORY_PAGE, { pageSize });
    if (typeof onProgress === "function") onProgress({ phase: "listing", i: 0, total: 1, url: firstUrl });
    const firstHtml = await fetchListingHtml(firstUrl, { fetchFn });
    const expectedTotal = extractTotalCount(firstHtml) || 0;
    let vehicles = dedupeVehicles(vehiclesFromListingHtml(firstHtml)).filter(isPreownedListing);

    const queued = new Set();
    for (const href of extractNextListingUrls(firstHtml)) queued.add(href);
    for (let start = pageSize; start < Math.max(expectedTotal, pageSize * 2); start += pageSize) {
      queued.add(listingUrl(USED_INVENTORY_PAGE, { start, pageSize }));
    }
    const pages = [...queued];
    for (let i = 0; i < pages.length; i++) {
      if (expectedTotal && vehicles.length >= expectedTotal) break;
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
      const url = pages[i];
      if (typeof onProgress === "function") {
        onProgress({ phase: "listing", i: i + 1, total: pages.length + 1, url, count: vehicles.length, expectedTotal });
      }
      try {
        const html = await fetchListingHtml(url, { fetchFn });
        vehicles = dedupeVehicles([...vehicles, ...vehiclesFromListingHtml(html)]).filter(isPreownedListing);
      } catch (e) {
        if (e?.blocked) throw e;
        break;
      }
    }

    const packs = vehicles.map(listingToPack).filter((p) => p.stock || p.vin);
    const complete = expectedTotal > 0 && packs.length >= expectedTotal;
    return {
      packs,
      expectedTotal,
      count: packs.length,
      complete,
      source: USED_INVENTORY_PAGE,
    };
  }

  return {
    SITE,
    USED_INVENTORY_PAGE,
    PAGE_SIZE,
    listingUrl,
    extractTotalCount,
    extractNextListingUrls,
    extractEmbeddedInventory,
    vehiclesFromListingHtml,
    isPreownedListing,
    listingToPack,
    dedupeVehicles,
    mergeLiveWithPrevious,
    collectUsedInventory,
    fetchListingHtml,
  };
});
