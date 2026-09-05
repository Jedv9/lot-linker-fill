import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;

function pack(stock) {
  const p = packs.find((x) => x.stock === stock);
  assert.ok(p, `missing pack ${stock}`);
  return p;
}

function assertLayout(body) {
  const lines = body.split("\n");
  assert.match(lines[0], /^Wisconsin shoppers looking for a \S+ under \$[\d,]+:$/);
  assert.equal(lines[1], "");
  assert.match(lines[2], / is available at Boucher Lake Country (Nissan|Hyundai) in Oconomowoc, Wisconsin\.$/);
  assert.equal(lines[3], "");
  assert.match(lines[4], /^Price: \$[\d,]+$/);
  assert.match(lines[5], /^Mileage: /);
  assert.match(lines[6], /^Stock #: /);
  assert.equal(lines[7], "");
  assert.equal(lines[8], "Key equipment:");
  let i = 9;
  let bullets = 0;
  while (lines[i] && lines[i].startsWith("• ")) {
    bullets += 1;
    i += 1;
  }
  assert.ok(bullets >= 0 && bullets <= 4, `expected 0–4 bullets, got ${bullets}`);
  assert.equal(lines[i], "");
  assert.match(lines[i + 1], /^Message "[^"]+" to confirm availability, receive the vehicle history report, and schedule a test drive\.$/);
  assert.equal(lines[i + 2], "");
  assert.equal(lines[i + 3], "Trade-ins welcome. Financing available for qualified buyers.");
  assert.equal(lines[i + 4], "");
  assert.equal(
    lines[i + 5],
    "Advertised price excludes applicable taxes, title, registration, dealer fees, and other charges. Equipment, pricing, and availability subject to verification. See dealer for complete details."
  );
}

const nissan = listing.fromPack(pack("26NU0143"));
assert.equal(nissan.title, "2026 Nissan Altima 2.5 SR | AWD | $30,470 | Oconomowoc WI");
assert.match(nissan.body, /looking for a sedan under \$30,470:/);
assert.match(nissan.body, /2026 Nissan Altima is available at Boucher Lake Country Nissan in Oconomowoc, Wisconsin\./);
assert.match(nissan.body, /Mileage: NEW/);
assert.match(nissan.body, /Stock #: 26NU0143/);
assert.match(nissan.body, /Message "Altima"/);
assert.match(nissan.body, /• Apple CarPlay \/ Android Auto/);
assert.match(nissan.body, /• Blind Spot Monitor/);
assert.match(nissan.body, /• Leatherette Seats/);
assert.doesNotMatch(nissan.body, /Bluetooth|Satellite Radio|Gasoline|Automatic transmission|Power Windows/i);
assert.doesNotMatch(nissan.body, /APR|0%|cash|ask for Jed/i);
assertLayout(nissan.body);

const hyundai = listing.fromPack(pack("25HY024"));
assert.equal(hyundai.title, "2025 Hyundai Elantra Hybrid Limited | FWD | $29,695 | Oconomowoc WI");
assert.match(hyundai.body, /looking for a sedan under \$29,695:/);
assert.match(hyundai.body, /2025 Hyundai Elantra Hybrid is available at Boucher Lake Country Hyundai in Oconomowoc, Wisconsin\./);
assert.match(hyundai.body, /Mileage: NEW/);
assert.match(hyundai.body, /Stock #: 25HY024/);
assert.match(hyundai.body, /Message "Elantra"/);
assert.match(hyundai.body, /• Heated Front Seats/);
assert.match(hyundai.body, /• Moonroof \/ Panoramic Roof/);
assert.match(hyundai.body, /• Apple CarPlay \/ Android Auto/);
assert.doesNotMatch(hyundai.body, /Bluetooth|Gasoline|Automatic transmission/i);
assertLayout(hyundai.body);

const f150 = listing.fromPack(pack("PU1388"));
assert.equal(f150.title, "2020 Ford F-150 King Ranch | 4WD | $35,895 | Oconomowoc WI");
assert.doesNotMatch(f150.title, /EcoBoost|3\.5L/);
assert.match(f150.body, /looking for a truck under \$35,895:/);
assert.match(f150.body, /Boucher Lake Country Nissan/);
assert.match(f150.body, /Mileage: 83,221/);
assert.match(f150.body, /Message "F-150"/);
assert.match(f150.body, /• Heated Seats/);
assert.match(f150.body, /• Backup Camera/);
assert.doesNotMatch(f150.body, /Wheellip|Paint Package|Gasoline|ABS/i);
assertLayout(f150.body);

const tucson = listing.fromPack(pack("26HY272"));
assert.equal(tucson.title, "2026 Hyundai Tucson Hybrid Limited | AWD | $45,090 | Oconomowoc WI");
assert.match(tucson.body, /looking for a SUV under \$45,090:/);
assert.match(tucson.body, /Message "Tucson"/);
assertLayout(tucson.body);

const junkOnly = listing.keyEquipment({
  body: "Standouts: Gasoline engine · Brake lights · Headlights · Seat belts · Airbags · AM/FM radio · Power windows · Automatic transmission · ABS · FWD. Also: Bluetooth, Satellite Radio Ready.",
  drivetrain: "FWD",
  transmission: "Automatic",
  fuel: "Gasoline",
});
assert.deepEqual(junkOnly, []);

const mixed = listing.keyEquipment({
  body: "Standouts: Gasoline engine · ABS · Power Windows · Heated Seats · Apple CarPlay · Android Auto · Bluetooth.",
  drivetrain: "AWD",
});
assert.ok(mixed.includes("Heated Seats"));
assert.ok(mixed.includes("Apple CarPlay / Android Auto"));
assert.ok(mixed.includes("AWD"));
assert.ok(!mixed.some((f) => /gasoline|abs|power windows|bluetooth|automatic/i.test(f)));
assert.ok(mixed.length <= 4);

assert.equal(listing.vehicleType({ bodyStyle: "Crew Cab 4D", model: "Santa Cruz" }), "truck");
assert.equal(listing.vehicleType({ bodyStyle: "Hatchback 4D", model: "Soul" }), "hatchback");
assert.equal(listing.vehicleType({ bodyStyle: "Passenger Van 4D", model: "Pacifica" }), "van");

console.log("NISSAN 26NU0143 TITLE\n" + nissan.title + "\n");
console.log("NISSAN 26NU0143 DESCRIPTION\n" + nissan.body + "\n");
console.log("HYUNDAI 25HY024 TITLE\n" + hyundai.title + "\n");
console.log("HYUNDAI 25HY024 DESCRIPTION\n" + hyundai.body + "\n");
console.log("ok");
