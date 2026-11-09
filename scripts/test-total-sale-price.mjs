import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DEALER_FEES,
  FILING_FEE,
  SERVICE_FEE,
  extractJsonLdVehicles,
  pickBasePrice,
  pickPrice,
  pickPricing,
  toPack,
} from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content-fb.js", import.meta.url), "utf8");
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));
const packsDoc = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8"));

assert.equal(SERVICE_FEE, 479);
assert.equal(FILING_FEE, 38);
assert.equal(DEALER_FEES, 517);
assert.equal(listing.SERVICE_FEE, 479);
assert.equal(listing.FILING_FEE, 38);
assert.equal(listing.DEALER_FEES, 517);

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
  vdpUrl: "https://www.lexusofbrookfield.com/certified/LEXUS/2024-LEXUS-NX-03985068ac1816bee9b0b4cfc2d870ea.htm",
};

const once = listing.withDealerFees(oldOverride);
assert.equal(once.basePrice, "43999");
assert.equal(once.price, "44516");
assert.equal(Number(once.basePrice) + listing.DEALER_FEES, Number(once.price));
assert.equal(once.serviceFee, "479");
assert.equal(once.filingFee, "38");
assert.equal(once.dealerFees, "517");
assert.equal(once.priceIncludesDealerFees, true);
assert.equal(listing.advertisedPrice(oldOverride), "44516");

const twice = listing.withDealerFees(once);
const thrice = listing.withDealerFees(listing.withDealerFees(twice));
assert.equal(twice.price, "44516");
assert.equal(twice.basePrice, "43999");
assert.equal(thrice.price, "44516");
assert.deepEqual(
  { price: twice.price, basePrice: twice.basePrice, dealerFees: twice.dealerFees },
  { price: thrice.price, basePrice: thrice.basePrice, dealerFees: thrice.dealerFees }
);

const loadThenRefresh = listing.withDealerFees(listing.withDealerFees({ ...oldOverride }));
assert.equal(loadThenRefresh.price, "44516");

assert.equal(pickPrice(cpo), 44516);
assert.equal(pickBasePrice(cpo), 43999);
const priced = pickPricing(cpo);
assert.equal(priced.base, 43999);
assert.equal(priced.total, 44516);
assert.equal(priced.total, priced.base + DEALER_FEES);

const cpoPack = toPack(cpo);
assert.equal(cpoPack.price, "44516");
assert.equal(cpoPack.basePrice, "43999");
assert.equal(listing.advertisedPrice(cpoPack), "44516");
assert.equal(listing.withDealerFees(cpoPack).price, "44516");
assert.equal(
  listing.pickerLabel(cpoPack),
  "PMT3253 · 2024 Lexus NX 350 Premium · 17,009 mi · $44,516"
);
assert.equal(listing.buildModelLine(cpoPack), "NX 350 Premium | AWD | $44,516 | Brookfield WI");
assert.equal(listing.buildTitle(cpoPack), "2024 Lexus NX 350 Premium | AWD | $44,516 | Brookfield WI");
const listingOut = listing.fromPack(oldOverride);
assert.equal(listingOut.modelLine, "NX 350 Premium | AWD | $44,516 | Brookfield WI");
assert.match(listingOut.body, /Wisconsin shoppers looking for a SUV under \$44,516:/);
assert.match(listingOut.body, /^Price: \$44,516$/m);
assert.match(listingOut.body, /Total Sale Price/);
assert.match(listingOut.body, /\$479 service fee and \$38 filing fee/);
assert.doesNotMatch(listingOut.body, /excludes applicable taxes, title, registration, dealer fees/);

const askingOnly = {
  pricing: { dprice: [{ typeClass: "askingPrice", value: "$43,999" }] },
  trackingPricing: { askingPrice: "$43,999" },
};
assert.equal(pickPrice(askingOnly), 44516);
assert.equal(pickBasePrice(askingOnly), 43999);

const siteTotal = {
  pricing: {
    dprice: [
      { typeClass: "askingPrice", value: "$43,999" },
      { typeClass: "documentFee", value: "$479" },
      { typeClass: "deliveryFee", value: "$38" },
      { typeClass: "internetPrice", value: "$44,516", isFinalPrice: true },
    ],
  },
};
assert.equal(pickPrice(siteTotal), 44516);
assert.equal(pickBasePrice(siteTotal), 43999);

const ld = extractJsonLdVehicles(
  `<script type="application/ld+json">{"@type":"CollectionPage","about":{"offers":{"itemOffered":[{"@type":["Product","Car"],"name":"Certified Pre-Owned 2024 LEXUS NX 350 Premium","url":"https://www.lexusofbrookfield.com/certified/LEXUS/2024-LEXUS-NX-03985068ac1816bee9b0b4cfc2d870ea.htm","offers":{"price":"44516"},"vehicleIdentificationNumber":"2T2GGCEZ9RC048310","sku":"PMT3253","vehicleModelDate":2024,"brand":{"name":"LEXUS"},"model":"NX"}]}}}</script>`
);
assert.equal(ld.length, 1);
assert.equal(pickBasePrice(ld[0]), 43999);
assert.equal(pickPrice(ld[0]), 44516);
assert.equal(toPack(ld[0]).price, "44516");

assert.match(popup, /withDealerFees/);
assert.match(popup, /normalizePacks/);
assert.match(content, /advertisedPrice/);

assert.equal(packsDoc.packs.length, 110);
assert.equal(packsDoc.complete, true);
const makes = new Set(packsDoc.packs.map((p) => p.make));
assert.equal(makes.size, 24);
for (const p of packsDoc.packs) {
  assert.equal(p.priceIncludesDealerFees, true, `fees flag missing ${p.stock}`);
  assert.equal(Number(p.price), Number(p.basePrice) + 517, `fees not exact-once ${p.stock}: base ${p.basePrice} price ${p.price}`);
  assert.equal(p.serviceFee, "479");
  assert.equal(p.filingFee, "38");
  const again = listing.withDealerFees(p);
  assert.equal(again.price, p.price);
  assert.equal(again.basePrice, p.basePrice);
}
const pmt = packsDoc.packs.find((p) => p.stock === "PMT3253");
assert.ok(pmt);
assert.equal(pmt.basePrice, "43999");
assert.equal(pmt.price, "44516");
assert.equal(listing.pickerLabel(pmt).endsWith("$44,516"), true);

console.log("total sale price ok · 43999→44516 · exact-once · 110 packs");
