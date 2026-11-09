/**
 * Lot Linker Fill — weekly inventory scraper.
 * Pulls ALL Lexus of Brookfield PRE-OWNED inventory (every make on used-inventory,
 * plus L/Certified) from the public dealer.com pages. Honors HTTP 429 Retry-After.
 * Refuses to overwrite packs.json with a silently partial collection.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  DEALER,
  PREOWNED_SOURCES,
  collectionComplete,
  dedupeVehicles,
  extractMakeFacets,
  extractNextListingUrls,
  extractTotalCount,
  isNewVehicle,
  isPreownedListing,
  makeBreakdown,
  makeFacetTotal,
  prettyMake,
  shouldWritePacks,
  toPack,
  vehiclesFromListingHtml,
} from "./dealer-inventory.mjs";
import { header, isRetryableHttp, retryDelayMs } from "./http-retry.mjs";

const require = createRequire(import.meta.url);
const soldWatch = require("../sold-watch.js");

const PAGE_SIZE = 24;
const SUCCESS_GAP_MS = 8000;
const MAX_RETRIES = 8;

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

async function gotoWithRetry(page, url) {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    lastStatus = resp?.status?.() || 0;
    const html = await page.content();
    if (!isRetryableHttp(lastStatus, html) && html.length > 2000) {
      return { resp, html, status: lastStatus };
    }
    const delay = retryDelayMs(resp?.headers?.() || {}, attempt, { baseMs: 15000, capMs: 90000 });
    const ra = header(resp?.headers?.() || {}, "retry-after") || "none";
    console.log(`HTTP ${lastStatus} ${url} — wait ${delay}ms (Retry-After=${ra}, attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
    if (attempt === MAX_RETRIES) break;
    await page.waitForTimeout(delay);
  }
  throw new Error(`blocked fetching ${url} (last HTTP ${lastStatus}) after Retry-After/backoff`);
}

function listingUrl(base, { start, make, pageSize } = {}) {
  const u = new URL(base);
  if (start) u.searchParams.set("start", String(start));
  else u.searchParams.delete("start");
  if (make) u.searchParams.set("make", make);
  if (pageSize) u.searchParams.set("pageSize", String(pageSize));
  return u.toString();
}

function haveForMake(breakdown, facet) {
  const keys = [facet.make, facet.label, facet.value, prettyMake(facet.value), prettyMake(facet.make)];
  for (const k of keys) {
    if (k && breakdown[k]) return breakdown[k];
  }
  return 0;
}

async function collectListingPage(page, url, label) {
  const got = await gotoWithRetry(page, url);
  await page.waitForTimeout(SUCCESS_GAP_MS);
  const vehicles = vehiclesFromListingHtml(got.html);
  console.log(`${label}: ${vehicles.length} on ${url}`);
  return { html: got.html, vehicles };
}

async function pullPagedListing(page, source) {
  const first = await collectListingPage(page, source.page, `${source.name} start=0`);
  const expectedTotal = extractTotalCount(first.html) || 0;
  const facets = extractMakeFacets(first.html);
  const facetSum = makeFacetTotal(facets);
  console.log(
    `${source.name}: site total=${expectedTotal} makeFacets=${facets.length} facetSum=${facetSum} makes=${facets.map((f) => f.make + ":" + f.count).join(",")}`
  );

  let vehicles = dedupeVehicles(first.vehicles).filter(isPreownedListing);
  const target = Math.max(expectedTotal, facetSum);

  if (vehicles.length < target && facets.length) {
    const missing = [...facets]
      .filter((f) => !/^lexus$/i.test(f.value || f.make || ""))
      .sort((a, b) => a.count - b.count);
    for (const facet of missing) {
      if (vehicles.length >= target) break;
      const got = haveForMake(makeBreakdown(vehicles), facet);
      if (got >= facet.count) continue;
      const makeValue = facet.value || facet.make;
      try {
        const url = listingUrl(source.page, { make: makeValue });
        const page1 = await collectListingPage(page, url, `${source.name} make=${makeValue}`);
        vehicles = dedupeVehicles([...vehicles, ...page1.vehicles]).filter(isPreownedListing);
        const still = haveForMake(makeBreakdown(vehicles), facet);
        if (still < facet.count) {
          for (let start = PAGE_SIZE; start < facet.count; start += PAGE_SIZE) {
            const moreUrl = listingUrl(source.page, { make: makeValue, start });
            const more = await collectListingPage(page, moreUrl, `${source.name} make=${makeValue} start=${start}`);
            vehicles = dedupeVehicles([...vehicles, ...more.vehicles]).filter(isPreownedListing);
          }
        }
        console.log(`${source.name}: make=${makeValue} unique=${vehicles.length}/${target}`);
      } catch (e) {
        console.log(`${source.name}: make=${makeValue} skipped: ${e.message || e}`);
      }
    }
  }

  if (vehicles.length < target) {
    const queued = new Set();
    for (const href of extractNextListingUrls(first.html)) queued.add(href);
    for (let start = PAGE_SIZE; start < target; start += PAGE_SIZE) {
      queued.add(listingUrl(source.page, { start }));
    }
    for (const url of queued) {
      if (vehicles.length >= target) break;
      try {
        const next = await collectListingPage(page, url, source.name);
        if (!next.vehicles.length) continue;
        vehicles = dedupeVehicles([...vehicles, ...next.vehicles]).filter(isPreownedListing);
        console.log(`${source.name}: unique=${vehicles.length}/${target} after ${url}`);
      } catch (e) {
        console.log(`${source.name}: pagination stop ${url}: ${e.message || e}`);
      }
    }
  }

  const newish = vehicles.filter(isNewVehicle).length;
  console.log(`${source.name}: pulled=${vehicles.length} expected=${target} newSkipped=${newish}`);
  return { vehicles, expectedTotal: target, facets };
}

async function enrichFromVdps(ctx, packs) {
  let ok = 0;
  const page = await ctx.newPage();
  try {
    for (let i = 0; i < packs.length; i++) {
      const pk = packs[i];
      if (!pk.vdpUrl) continue;
      try {
        const { html } = await gotoWithRetry(page, pk.vdpUrl);
        await page.waitForTimeout(400);
        const feats = await page.evaluate(vdpFeatureExtractor);
        pk.keyEquipment = buildKeyEquipment([...(feats || []), ...(pk.features || [])], pk);
        if (feats.length) {
          pk.features = [...(pk.features || []), ...feats];
          ok += 1;
        }
      } catch (e) {
        console.log(`VDP enrich stop at ${i + 1}/${packs.length}: ${e.message || e}`);
        pk.keyEquipment = buildKeyEquipment(pk.features || [], pk);
        break;
      }
    }
  } finally {
    await page.close();
  }
  console.log(`VDP equipment read for ${ok}/${packs.length} vehicles`);
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
  const sourcesUsed = [];
  let expectedUsed = 0;
  let usedFacets = [];

  for (const source of PREOWNED_SOURCES) {
    if (source.name === "cpo" && collectionComplete({ expectedTotal: expectedUsed, uniqueCount: dedupeVehicles(pulled).length })) {
      console.log("skipping CPO listing; used-inventory already complete (CPO is a subset)");
      continue;
    }
    try {
      const got = await pullPagedListing(page, source);
      pulled.push(...got.vehicles);
      sourcesUsed.push(source.page);
      if (source.name === "used") {
        expectedUsed = got.expectedTotal;
        usedFacets = got.facets;
      }
    } catch (e) {
      errors.push(`${source.name}: ${e.message || e}`);
      console.error(e);
    }
  }

  await page.close();

  const vehicles = dedupeVehicles(pulled).filter(isPreownedListing);
  const unique = vehicles.length;
  const complete = collectionComplete({ expectedTotal: expectedUsed, uniqueCount: unique });
  const pulledMakes = makeBreakdown(vehicles);
  console.log(`unique preowned=${unique} expectedUsed=${expectedUsed} complete=${complete}`);
  console.log("make breakdown", JSON.stringify(pulledMakes));

  let previous = { packs: [] };
  try {
    previous = JSON.parse(fs.readFileSync("packs.json", "utf8"));
  } catch {}
  const previousCount = Array.isArray(previous.packs) ? previous.packs.length : 0;
  const gate = shouldWritePacks({ complete, previousCount, newCount: unique });
  if (!gate.write) {
    await browser.close();
    const missing = usedFacets
      .map((f) => ({ make: f.make, expected: f.count, got: pulledMakes[f.make] || 0 }))
      .filter((r) => r.got < r.expected);
    console.error(
      `NOT writing packs.json (${gate.reason}). unique=${unique} expected=${expectedUsed}. missingMakes=${JSON.stringify(missing)}. errors=${errors.join("; ") || "none"}`
    );
    process.exit(2);
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

  for (const pk of packs) {
    pk.keyEquipment = buildKeyEquipment(pk.features || [], pk);
  }
  await browser.close();

  const generatedAt = new Date().toISOString();
  const snapshot = soldWatch.buildSoldSnapshot({
    previousPacks: previous.packs || [],
    nextPacks: packs,
    previousHistory: previous.soldHistory || previous.sold || [],
    now: generatedAt,
    keepDays: soldWatch.KEEP_DAYS,
    complete: true,
    expectedTotal: expectedUsed,
  });
  const sold = snapshot.sold;
  const soldHistory = snapshot.soldHistory;

  const out = {
    generatedAt,
    source: sourcesUsed.join(" + ") + " (PRE-OWNED, all makes)",
    dealer: DEALER.name,
    site: DEALER.site,
    complete: true,
    expectedTotal: expectedUsed,
    count: packs.length,
    makes: pulledMakes,
    makeFacets: usedFacets,
    sources: sourcesUsed,
    soldSinceLast: sold.length,
    sold,
    soldHistory,
    packs,
  };
  fs.writeFileSync("packs.json", JSON.stringify(out));
  console.log(
    `Wrote packs.json — ${packs.length} pre-owned (complete vs ${expectedUsed}), ${sold.length} sold since last run, ${soldHistory.length} in ${soldWatch.KEEP_DAYS}-day soldHistory, ${(
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
