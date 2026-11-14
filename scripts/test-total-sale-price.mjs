import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DEALER_FEES,
  FILING_FEE,
  SERVICE_FEE,
  pickBasePrice,
  pickPrice,
  pickPricing,
  toPack,
} from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const vdp = require("../vdp-price.js");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content-fb.js", import.meta.url), "utf8");
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));
const esHtml = readFileSync(new URL("./fixtures/es-vdp-pricing.html", import.meta.url), "utf8");

assert.equal(SERVICE_FEE, 479);
assert.equal(FILING_FEE, 38);
assert.equal(DEALER_FEES, 517);
assert.equal(listing.SERVICE_FEE, 479);
assert.equal(listing.FILING_FEE, 38);
assert.equal(listing.DEALER_FEES, 517);

const es = vdp.extractTotalSalePrice(esHtml);
assert.equal(es.total, 46815);
const fromFeed = vdp.applyLiveTotal({ stock: "PER3178", price: "47015", basePrice: "46498" }, es);
assert.equal(fromFeed.price, "46815");
assert.equal(listing.advertisedPrice(fromFeed), "46815");
assert.equal(listing.withDealerFees(fromFeed).price, "46815");

const oldOverride = {
  stock: "PMT3253",
  year: "2024",
  make: "Lexus",
  model: "NX",
  trim: "350 Premium",
  mileage: "17009",
  condition: "CPO",
  certified: true,
  drivetrain: "AWD",
  price: "43999",
  rooftop: "Lexus of Brookfield",
};
assert.equal(listing.advertisedPrice(oldOverride), "");
assert.equal(listing.advertisedPack(oldOverride).priceMissing, true);

assert.equal(pickPrice(cpo), 44516);
assert.equal(pickBasePrice(cpo), 43999);
const priced = pickPricing(cpo);
assert.equal(priced.base, 43999);
assert.equal(priced.total, 44516);
assert.equal(priced.found, true);

const cpoPack = toPack(cpo);
assert.equal(cpoPack.price, "44516");
assert.equal(cpoPack.basePrice, "43999");
assert.equal(cpoPack.totalSalePrice, "44516");
assert.equal(listing.advertisedPrice(cpoPack), "44516");
assert.equal(listing.withDealerFees(cpoPack).price, "44516");
assert.equal(
  listing.pickerLabel(cpoPack),
  "PMT3253 · 2024 Lexus NX 350 Premium · 17,009 mi · $44,516"
);
assert.equal(listing.buildModelLine(cpoPack), "NX 350 Premium | AWD | $44,516 | Brookfield WI");
const listingOut = listing.fromPack(cpoPack);
assert.equal(listingOut.modelLine, "NX 350 Premium | AWD | $44,516 | Brookfield WI");
assert.match(listingOut.body, /Wisconsin shoppers looking for a SUV under \$44,516:/);
assert.match(listingOut.body, /^Price: \$44,516$/m);
assert.match(listingOut.body, /Total Sale Price/);

const askingOnly = {
  pricing: { dprice: [{ typeClass: "askingPrice", value: "$43,999" }] },
  trackingPricing: { askingPrice: "$43,999" },
};
assert.equal(pickPrice(askingOnly), 0);
assert.equal(pickPricing(askingOnly).found, false);

const siteTotal = {
  pricing: {
    dprice: [
      { typeClass: "askingPrice", value: "$43,999" },
      { typeClass: "documentFee", value: "$479" },
      { typeClass: "deliveryFee", value: "$38" },
      { typeClass: "internetPrice", value: "$44,516", isFinalPrice: true, label: "Total Sale Price" },
    ],
  },
};
assert.equal(pickPrice(siteTotal), 44516);
assert.equal(pickBasePrice(siteTotal), 43999);

assert.match(popup, /overlayVdpTotals|overlayLiveTotals/);
assert.match(popup, /normalizePacks/);
assert.match(content, /advertisedPrice/);
assert.match(content, /priceMissing/);

console.log("total sale price ok · VDP Total Sale Price 46815 · no asking+517");
