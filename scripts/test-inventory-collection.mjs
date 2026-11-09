import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectionComplete,
  dedupeVehicles,
  extractMakeFacets,
  extractNextListingUrls,
  extractPreownedSitemapUrls,
  extractTotalCount,
  isListable,
  isPreownedListing,
  makeBreakdown,
  makeFacetTotal,
  shouldWritePacks,
  vehiclesFromListingHtml,
} from "./dealer-inventory.mjs";
import { isRetryableHttp, retryDelayMs } from "./http-retry.mjs";

const listing = readFileSync(new URL("./fixtures/used-listing-page.html", import.meta.url), "utf8");
const listing2 = readFileSync(new URL("./fixtures/used-listing-page2.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./fixtures/sitemap-preowned-snippet.html", import.meta.url), "utf8");
const facetsDoc = JSON.parse(readFileSync(new URL("./fixtures/used-make-facets.json", import.meta.url), "utf8"));
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");
const retryMod = readFileSync(new URL("./http-retry.mjs", import.meta.url), "utf8");

assert.equal(extractTotalCount(listing), 110);
const facets = extractMakeFacets(listing);
assert.equal(facets.length, 3);
assert.equal(makeFacetTotal(facets), 60);
assert.equal(facets.find((f) => f.make === "Lexus").count, 50);
assert.equal(facets.find((f) => f.make === "Genesis").value, "Genesis");

const census = `"id":"make","label":"Make","values":${JSON.stringify(facetsDoc.values)}`;
const censusFacets = extractMakeFacets(census);
assert.equal(censusFacets.length, 24);
assert.equal(makeFacetTotal(censusFacets), 110);
assert.ok(censusFacets.some((f) => f.make === "BMW" && f.count === 7));
assert.ok(censusFacets.some((f) => /Cadillac/i.test(f.make) && f.count === 1));

const page1 = vehiclesFromListingHtml(listing);
assert.equal(page1.length, 2);
assert.equal(page1.filter(isPreownedListing).length, 2);
const thin = { ...page1[1], images: [] };
assert.equal(isPreownedListing(thin), true);
assert.equal(isListable(thin), false, "thin-photo units stay in the bundle via isPreownedListing, not isListable");

const page2 = vehiclesFromListingHtml(listing2);
const merged = dedupeVehicles([...page1, ...page2]);
assert.equal(merged.length, 3, "VIN/stock overlap between pages is dropped");
assert.deepEqual(makeBreakdown(merged), { Lexus: 1, Genesis: 1, Toyota: 1 });

const nexts = extractNextListingUrls(listing);
assert.ok(nexts.some((u) => /start=24/.test(u)));
assert.ok(nexts.some((u) => /start=48/.test(u)));

const sm = extractPreownedSitemapUrls(sitemap);
assert.equal(sm.length, 3);
assert.ok(sm.every((u) => !/\/new\/|\/electric-new\//.test(u)));
assert.ok(sm.length < 110, "HTML sitemap is not a complete inventory export");

assert.equal(collectionComplete({ expectedTotal: 110, uniqueCount: 110 }), true);
assert.equal(collectionComplete({ expectedTotal: 110, uniqueCount: 43 }), false);
assert.equal(collectionComplete({ expectedTotal: 0, uniqueCount: 43 }), false);

assert.equal(shouldWritePacks({ complete: true, previousCount: 43, newCount: 110 }).write, true);
assert.equal(shouldWritePacks({ complete: false, previousCount: 43, newCount: 80 }).write, false);
assert.equal(shouldWritePacks({ complete: false, previousCount: 110, newCount: 40 }).write, false);
assert.match(shouldWritePacks({ complete: false, previousCount: 110, newCount: 40 }).reason, /larger existing bundle/);

assert.equal(retryDelayMs({ "retry-after": "12" }, 0), 12000);
assert.ok(retryDelayMs({}, 0) >= 4000);
assert.ok(retryDelayMs({}, 3) > retryDelayMs({}, 0));
assert.equal(isRetryableHttp(429), true);
assert.equal(isRetryableHttp(200, "ok"), false);
assert.equal(isRetryableHttp(503, "Too Many Requests"), true);

assert.match(scraper, /Retry-After/);
assert.match(scraper, /shouldWritePacks/);
assert.match(scraper, /soldHistory/);
assert.match(scraper, /buildSoldSnapshot/);
assert.ok(scraper.indexOf("if (!gate.write)") < scraper.indexOf("buildSoldSnapshot"));
assert.match(scraper, /start=/);
assert.match(scraper, /make/);
assert.match(scraper, /dedupeVehicles/);
assert.match(retryMod, /retry-after/i);
assert.doesNotMatch(scraper, /proxy|socks5|cloudflare.?bypass|residential/i);

console.log(
  `inventory collection ok · facets ${censusFacets.length}=${makeFacetTotal(censusFacets)} · pages ${merged.length} unique · sitemap ${sm.length}`
);
