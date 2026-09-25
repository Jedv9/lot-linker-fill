import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");

assert.equal(listing.FB_MIN_MILEAGE, 300);
assert.equal(listing.marketplaceMileage({ mileage: "0" }), "300");
assert.equal(listing.marketplaceMileage({ mileage: 0, odometerMiles: 0 }), "300");
assert.equal(listing.marketplaceMileage({ mileage: "50" }), "300");
assert.equal(listing.marketplaceMileage({ odometerMiles: 50 }), "300");
assert.equal(listing.marketplaceMileage({ mileage: "" }), "300");
assert.equal(listing.marketplaceMileage({}), "300");
assert.equal(listing.marketplaceMileage({ mileage: "299" }), "300");
assert.equal(listing.marketplaceMileage({ mileage: "300" }), "300");
assert.equal(listing.marketplaceMileage({ mileage: "12000" }), "12000");
assert.equal(listing.marketplaceMileage({ odometerMiles: 12000, mileage: "0" }), "12000");
assert.equal(listing.mileageLabel({ mileage: "0", condition: "NEW" }), "300 mi");
assert.equal(listing.mileageLabel({ mileage: "50", condition: "USED" }), "300 mi");
assert.equal(listing.mileageLabel({ mileage: "12000", condition: "USED" }), "12,000 mi");
assert.equal(listing.formatMileage({ mileage: "0", condition: "NEW" }), "NEW");

console.log("marketplace mileage clamp ok · 0/50/blank → 300 · 12000 stays 12000");
