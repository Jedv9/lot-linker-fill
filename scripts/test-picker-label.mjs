import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;

assert.ok(packs.length >= 200, `expected full inventory, got ${packs.length}`);

const labelRe = / · (NEW|\d{1,3}(?:,\d{3})* mi) · \$[\d,]+$/;

for (const pack of packs) {
  const label = listing.pickerLabel(pack);
  assert.match(label, labelRe, `bad picker label for ${pack.stock}: ${label}`);
  assert.match(label, new RegExp(`^${pack.stock} · `));
  assert.match(label, new RegExp(String(pack.year)));
  assert.match(label, new RegExp(String(pack.make)));
  assert.match(label, /\$/);
}

assert.equal(
  listing.pickerLabel(packs.find((p) => p.stock === "PU1392")),
  "PU1392 · 2012 Ford F-150 SVT Raptor · 109,782 mi · $26,900"
);
assert.equal(
  listing.pickerLabel(packs.find((p) => p.stock === "26NU0143")),
  "26NU0143 · 2026 Nissan Altima 2.5 SR · NEW · $30,470"
);

console.log(`picker labels ok · ${packs.length} packs`);
