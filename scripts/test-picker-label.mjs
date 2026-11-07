import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { toPack } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));

assert.ok(packs.length >= 10, `expected bundled pre-owned inventory, got ${packs.length}`);

const labelRe = / · (NEW|\d{1,3}(?:,\d{3})* mi) · \$[\d,]+$/;

for (const pack of packs) {
  const label = listing.pickerLabel(pack);
  assert.match(label, labelRe, `bad picker label for ${pack.stock}: ${label}`);
  assert.match(label, new RegExp(`^${pack.stock} · `));
  assert.match(label, new RegExp(String(pack.year)));
  assert.match(label, new RegExp(String(pack.make)));
  assert.match(label, /\$/);
  assert.doesNotMatch(label, /Boucher|Lake Country|Oconomowoc/);
  assert.notEqual(String(pack.condition).toUpperCase(), "NEW");
}

assert.equal(
  listing.pickerLabel(toPack(cpo)),
  "PMT3253 · 2024 Lexus NX 350 Premium · 17,009 mi · $44,516"
);
assert.equal(
  listing.pickerLabel({
    stock: "PU1392",
    year: "2012",
    make: "Ford",
    model: "F-150",
    trim: "SVT Raptor",
    mileage: "109782",
    price: "26900",
    rooftop: "Lexus of Brookfield",
  }),
  "PU1392 · 2012 Ford F-150 SVT Raptor · 109,782 mi · $27,417"
);

console.log(`picker labels ok · ${packs.length} packs`);
