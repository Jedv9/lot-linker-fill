import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pickPrice, pickPricing, toPack } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const vdp = require("../vdp-price.js");
const listing = require("../listing-copy.js");
const esHtml = readFileSync(new URL("./fixtures/es-vdp-pricing.html", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");

const splitEs = readFileSync(new URL("./fixtures/vdp-es-per3178-split.html", import.meta.url), "utf8");
const extracted = vdp.extractTotalSalePrice(esHtml);
assert.equal(extracted.found, true);
assert.equal(extracted.total, 46815);
const split = vdp.extractTotalSalePrice(splitEs);
assert.equal(split.total, 46815);
assert.equal(split.asking, 46298);
assert.equal(vdp.moneyFromScattered("$\n46,815"), 46815);
assert.equal(extracted.asking, 46298);
assert.equal(extracted.serviceFee, 479);
assert.equal(extracted.filingFee, 38);
assert.equal(extracted.total, 46298 + 479 + 38, "screenshot math matches; the parser still reads 46815 from the page");
assert.notEqual(extracted.total, 47015, "must not use listing-feed asking 46498 + 517");
assert.match(extracted.source, /vdp-visible|dprice-label|dom-dt-dd|text-label/);

const stale = {
  stock: "PER3178",
  year: "2025",
  make: "Lexus",
  model: "ES",
  trim: "350",
  mileage: "7015",
  basePrice: "46498",
  price: "47015",
  priceIncludesDealerFees: true,
  rooftop: "Lexus of Brookfield",
};
const live = vdp.applyLiveTotal(stale, extracted);
assert.equal(live.price, "46815");
assert.equal(live.totalSalePrice, "46815");
assert.equal(live.basePrice, "46298");
assert.equal(live.priceMissing, false);
assert.equal(listing.advertisedPrice(live), "46815");
assert.equal(listing.advertisedPrice(stale), "", "stale computed price is not advertised");
assert.equal(listing.withDealerFees(live).price, "46815");

const missingHtml = "<html><body><p>Price $46,298</p></body></html>";
const missing = vdp.extractTotalSalePrice(missingHtml);
assert.equal(missing.found, false);
assert.equal(missing.total, 0);
const flagged = vdp.applyLiveTotal(stale, missing);
assert.equal(flagged.priceMissing, true);
assert.equal(flagged.price, "");
assert.equal(listing.advertisedPrice(flagged), "");
assert.match(listing.pickerLabel(flagged), /PRICE MISSING/);

const askingOnly = {
  pricing: { dprice: [{ typeClass: "askingPrice", label: "Price", value: "$46,298" }] },
};
assert.equal(pickPrice(askingOnly), 0);
assert.equal(pickPricing(askingOnly).found, false);
assert.notEqual(pickPrice(askingOnly), 46815);

const labeled = {
  pricing: {
    dprice: [
      { typeClass: "askingPrice", label: "Price", value: "$46,298" },
      { typeClass: "documentFee", label: "Service Fee", value: "$479" },
      { typeClass: "deliveryFee", label: "ECT Filing Fee", value: "$38" },
      { typeClass: "internetPrice", label: "Total Sale Price", value: "$46,815", isFinalPrice: true },
    ],
  },
};
assert.equal(pickPrice(labeled), 46815);
assert.equal(toPack(labeled).price, "46815");
assert.equal(toPack(labeled).priceMissing, false);

const overlay = await vdp.overlayLiveTotals(
  [
    { ...stale, vdpUrl: "https://www.lexusofbrookfield.com/certified/LEXUS/es.htm" },
    { stock: "NONE", rooftop: "Lexus of Brookfield" },
  ],
  { fetchFn: async () => esHtml, gapMs: 0 }
);
assert.equal(overlay.found, 1);
assert.equal(overlay.missing, 1);
assert.equal(overlay.packs[0].price, "46815");
assert.equal(overlay.packs[1].priceMissing, true);

assert.match(popup, /overlayVdpTotals|overlayLiveTotals/);
assert.match(popup, /Reading live Total Sale Price/);
assert.match(popup, /priceWarn|PRICE MISSING|missing Total Sale Price/);
assert.match(popup, /collectUsedInventory/);
assert.match(popup, /overlayVdpTotals\(\[selected\]\)/);
assert.match(popup, /used-inventory/);
assert.match(scraper, /overlayLiveTotals/);
assert.doesNotMatch(readFileSync(new URL("../listing-copy.js", import.meta.url), "utf8"), /base \+ DEALER_FEES/);

console.log("vdp total sale price ok · ES 350 46298/479/38 → read 46815 not computed 47015");
