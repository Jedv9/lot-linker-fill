import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { shouldWritePacks } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const sold = require("../sold-watch.js");
const listing = require("../listing-copy.js");
const packsDoc = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8"));
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const zipBuild = readFileSync(new URL("./build-zip.sh", import.meta.url), "utf8");

function pack(stock, extra = {}) {
  return {
    stock,
    vin: extra.vin || `VIN${stock}XXXXXX`.slice(0, 17),
    year: extra.year || "2024",
    make: extra.make || "Lexus",
    model: extra.model || "NX",
    trim: extra.trim || "350 Premium",
    price: extra.price || "44516",
    rooftop: extra.rooftop || "Lexus of Brookfield",
    vdpUrl: extra.vdpUrl || "https://www.lexusofbrookfield.com/used/Lexus/x.htm",
    condition: extra.condition || "USED",
    ...extra,
  };
}

const previous = [
  pack("PMT3253", { vin: "2T2GGCEZ9RC048310", price: "44516" }),
  pack("KEEP001", { vin: "JTHBA1D20N5000001", make: "Lexus", model: "IS", trim: "300", price: "32000" }),
];
const next = [previous[1]];
const now = "2026-11-09T12:00:00.000Z";

const detected = sold.detectSold({
  previousPacks: previous,
  nextPacks: next,
  complete: true,
  expectedTotal: 1,
  now,
});
assert.equal(detected.skipped, "");
assert.equal(detected.sold.length, 1);
assert.equal(detected.sold[0].stock, "PMT3253");
assert.equal(detected.sold[0].vin, "2T2GGCEZ9RC048310");
assert.equal(sold.vinLast6(detected.sold[0].vin), "048310");
assert.equal(detected.sold[0].lastPrice, "44516");
assert.equal(detected.sold[0].detectedAt, now);
assert.match(detected.sold[0].vehicle, /2024 Lexus NX 350 Premium/);
assert.equal(sold.soldMeta(detected.sold[0]), "Stock PMT3253 · VIN …048310 · $44,516");
assert.equal(sold.soldDateLabel(detected.sold[0]), `Gone ${new Date(now).toLocaleDateString()}`);

const fakeStorage = { soldWatch: [], soldDismissed: {} };
fakeStorage.soldWatch = sold.mergeSoldHistory(fakeStorage.soldWatch, detected.sold, {
  now,
  liveStocks: next.map((p) => p.stock),
});
assert.equal(fakeStorage.soldWatch.length, 1);
assert.equal(sold.undismissedCount(fakeStorage.soldWatch, fakeStorage.soldDismissed), 1);
assert.equal(sold.badgeText(1), "1");

fakeStorage.soldDismissed = sold.markDismissed(fakeStorage.soldDismissed, "PMT3253", "2026-11-09T18:00:00.000Z");
assert.equal(sold.undismissedCount(fakeStorage.soldWatch, fakeStorage.soldDismissed), 0);
assert.equal(sold.badgeText(sold.undismissedCount(fakeStorage.soldWatch, fakeStorage.soldDismissed)), "");
assert.equal(fakeStorage.soldWatch.length, 1, "dismiss hides the row but keeps history until expiry / return");
assert.equal(fakeStorage.soldDismissed.PMT3253, "2026-11-09T18:00:00.000Z");

const stillGone = sold.mergeSoldHistory(fakeStorage.soldWatch, [], {
  now: "2026-11-10T12:00:00.000Z",
  liveStocks: next.map((p) => p.stock),
});
assert.equal(stillGone.length, 1);
assert.equal(sold.undismissedCount(stillGone, fakeStorage.soldDismissed), 0);

const returned = sold.mergeSoldHistory(fakeStorage.soldWatch, [], {
  now: "2026-11-10T12:00:00.000Z",
  liveStocks: ["PMT3253", "KEEP001"],
});
assert.equal(returned.length, 0);
const prunedDismissed = sold.pruneDismissed(fakeStorage.soldDismissed, ["PMT3253", "KEEP001"]);
assert.equal(Object.keys(prunedDismissed).length, 0);

const partial = sold.detectSold({
  previousPacks: previous.concat(Array.from({ length: 108 }, (_, i) => pack(`OLD${i}`))),
  nextPacks: Array.from({ length: 40 }, (_, i) => pack(`NEW${i}`)),
  complete: false,
  expectedTotal: 110,
  now,
});
assert.equal(partial.skipped, "incomplete");
assert.equal(partial.sold.length, 0);

const expectedShort = sold.detectSold({
  previousPacks: previous,
  nextPacks: next,
  complete: true,
  expectedTotal: 110,
  now,
});
assert.equal(expectedShort.skipped, "incomplete");
assert.equal(expectedShort.sold.length, 0);

const emptyNext = sold.detectSold({
  previousPacks: previous,
  nextPacks: [],
  complete: true,
  expectedTotal: 0,
  now,
});
assert.equal(emptyNext.sold.length, 0);

assert.equal(shouldWritePacks({ complete: false, previousCount: 110, newCount: 40 }).write, false);

const untrustedMass = sold.buildSoldSnapshot({
  previousPacks: previous.concat(Array.from({ length: 108 }, (_, i) => pack(`OLD${i}`))),
  nextPacks: Array.from({ length: 40 }, (_, i) => pack(`NEW${i}`)),
  previousHistory: [{ stock: "AGE1", vin: "AAAAAAAAAAAAAAAAA", detectedAt: "2026-09-01T00:00:00.000Z", lastPrice: "1" }],
  now,
  complete: false,
  expectedTotal: 110,
});
assert.equal(untrustedMass.skipped, "incomplete");
assert.equal(untrustedMass.sold.length, 0);
assert.equal(untrustedMass.soldSinceLast, 0);
assert.ok(!untrustedMass.soldHistory.some((r) => /^OLD/.test(r.stock)), "partial pull must not flood soldHistory");

const history = sold.mergeSoldHistory(
  [
    { stock: "OLD60", vin: "1HGCM82633A004352", vehicle: "old", lastPrice: "1000", detectedAt: "2026-09-01T00:00:00.000Z" },
    { stock: "KEEP60", vin: "1HGCM82633A004353", vehicle: "keep", lastPrice: "2000", detectedAt: "2026-10-01T00:00:00.000Z" },
  ],
  [{ stock: "PMT3253", vin: "2T2GGCEZ9RC048310", lastPrice: "44516", year: "2024", make: "Lexus", model: "NX", trim: "350 Premium" }],
  { now, keepDays: 60, liveStocks: ["KEEP001"] }
);
assert.ok(!history.some((r) => r.stock === "OLD60"), "entries older than 60 days drop");
assert.ok(history.some((r) => r.stock === "KEEP60"));
assert.equal(history.find((r) => r.stock === "PMT3253").detectedAt, now);

const oldDealer = sold.detectSold({
  previousPacks: [
    pack("PMT3253"),
    pack("LAKE1", { rooftop: "Lake Country Nissan", vdpUrl: "https://www.nissanlakecountry.com/x" }),
  ],
  nextPacks: [],
  complete: true,
  expectedTotal: 1,
  now,
});
assert.equal(oldDealer.sold.length, 0, "empty next is untrusted");
const oldDealerGone = sold.detectSold({
  previousPacks: [
    pack("PMT3253"),
    pack("LAKE1", { rooftop: "Lake Country Nissan", vdpUrl: "https://www.nissanlakecountry.com/x" }),
  ],
  nextPacks: [pack("KEEP001")],
  complete: true,
  expectedTotal: 1,
  now,
});
assert.deepEqual(oldDealerGone.sold.map((r) => r.stock), ["PMT3253"]);

const clientCatch = sold.mergeWatchFromRefresh({
  existing: [],
  payload: { complete: true, expectedTotal: 1, sold: [], soldHistory: [] },
  previousPacks: previous,
  nextPacks: next,
  now,
});
assert.equal(clientCatch.detected.length, 1);
assert.equal(clientCatch.soldWatch[0].stock, "PMT3253");

const listed = sold.toggleListed({}, "PMT3253", true);
assert.equal(sold.isListed(listed, "PMT3253"), true);
const ranked = sold.sortSoldForDisplay(
  [
    { stock: "OTHER", vehicle: "Other", detectedAt: "2026-11-09T13:00:00.000Z" },
    { stock: "PMT3253", vehicle: "Listed car", detectedAt: "2026-11-09T10:00:00.000Z" },
  ],
  listed
);
assert.equal(ranked[0].stock, "PMT3253");

const oldOverride = {
  stock: "PMT3253",
  year: "2024",
  make: "Lexus",
  model: "NX",
  trim: "350 Premium",
  price: "43999",
  rooftop: "Lexus of Brookfield",
};
const once = listing.withDealerFees(oldOverride);
assert.equal(listing.DEALER_FEES, 517);
assert.equal(once.price, "44516");
assert.equal(Number(once.basePrice) + 517, Number(once.price));
assert.equal(listing.withDealerFees(once).price, "44516");
const soldFromFeePack = sold.soldRowFromPack(once, now);
assert.equal(soldFromFeePack.lastPrice, "44516");

for (const p of packsDoc.packs) {
  if (!p.priceIncludesDealerFees) continue;
  const again = listing.withDealerFees(p);
  assert.equal(again.price, p.price, `fees must stay exact-once on ${p.stock}`);
  assert.equal(Number(again.basePrice) + 517, Number(again.price));
}

assert.ok(Array.isArray(packsDoc.soldHistory));
assert.equal(sold.KEEP_DAYS, 60);
assert.match(scraper, /soldHistory/);
assert.match(scraper, /buildSoldSnapshot/);
assert.match(scraper, /KEEP_DAYS/);
assert.match(scraper, /shouldWritePacks/);
assert.ok(scraper.indexOf("shouldWritePacks") < scraper.indexOf("buildSoldSnapshot"));
assert.ok(scraper.indexOf("if (!gate.write)") < scraper.indexOf("buildSoldSnapshot"));

assert.match(popupHtml, /Sold — take these down/);
assert.match(popupHtml, /id="soldSection"/);
assert.match(popupHtml, /sold-watch\.js/);
assert.match(popupHtml, /Listed on Marketplace/);
assert.match(popup, /soldWatch/);
assert.match(popup, /soldDismissed/);
assert.match(popup, /lastSeenSummaries/);
assert.match(popup, /Taken down/);
assert.match(popup, /isTrustedComplete/);
assert.match(popup, /skipClientDetect/);
assert.match(popup, /listedStocks/);
assert.match(background, /sold-watch\.js/);
assert.match(background, /setBadgeText/);
assert.match(background, /soldWatch/);
assert.match(zipBuild, /sold-watch\.js/);

console.log("sold watch ok · detect/dismiss/partial-gate/fees $517 once");
