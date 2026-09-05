import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;
const vdpFixture = readFileSync(new URL("./vdp-feature-fixture.html", import.meta.url), "utf8");

function pack(stock) {
  const p = packs.find((x) => x.stock === stock);
  assert.ok(p, `missing pack ${stock}`);
  return p;
}

function bullets(body) {
  return body.split("\n").filter((l) => l.startsWith("• ")).map((l) => l.slice(2));
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
  let n = 0;
  while (lines[i] && lines[i].startsWith("• ")) {
    n += 1;
    i += 1;
  }
  assert.ok(n >= 0 && n <= 5, `expected 0–5 bullets, got ${n}`);
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
assert.deepEqual(bullets(nissan.body), [
  "Apple CarPlay / Android Auto",
  "Blind Spot Monitor",
  "Power Seats",
  "AWD",
  "Leatherette Seats",
]);
assert.doesNotMatch(nissan.body, /Bluetooth|Satellite Radio|Gasoline|Automatic transmission|Moonroof/i);
assertLayout(nissan.body);

const hyundai = listing.fromPack(pack("25HY024"));
assert.equal(hyundai.title, "2025 Hyundai Elantra Hybrid Limited | FWD | $29,695 | Oconomowoc WI");
assert.deepEqual(bullets(hyundai.body), [
  "Heated Front Seats",
  "Apple CarPlay / Android Auto",
  "Blind Spot Monitor",
  "Power Seats",
  "Moonroof / Panoramic Roof",
]);
assert.doesNotMatch(hyundai.body, /Bluetooth|Gasoline|Automatic transmission|\bFWD\b/);
assertLayout(hyundai.body);

const f150 = listing.fromPack(pack("PU1388"));
assert.deepEqual(listing.keyEquipment(pack("PU1388")), [
  "Heated Seats",
  "Backup Camera",
  "4WD",
]);
assert.ok(listing.needsResearch(pack("PU1388")));
assertLayout(f150.body);

const junkOnly = listing.keyEquipment({
  body: "Standouts: Gasoline engine · Brake lights · Headlights · Seat belts · Airbags · AM/FM radio · Power windows · Automatic transmission · ABS · FWD · Torsen · Fox shocks · 3.73 axle ratio. Also: Bluetooth, Satellite Radio Ready.",
  drivetrain: "FWD",
});
assert.deepEqual(junkOnly, []);

const mixed = listing.keyEquipment({
  body: "Standouts: Gasoline engine · ABS · Power Windows · Heated Seats · Apple CarPlay · Android Auto · Bluetooth.",
  drivetrain: "AWD",
});
assert.deepEqual(mixed, ["Heated Seats", "Apple CarPlay / Android Auto", "AWD"]);

const extracted = listing.extractFeaturesFromHtml(vdpFixture);
assert.ok(extracted.some((f) => /leather seats/i.test(f)));
assert.ok(extracted.some((f) => /apple carplay/i.test(f)));
assert.ok(extracted.some((f) => /remote start/i.test(f)));
assert.ok(extracted.some((f) => /power seats/i.test(f)));
assert.ok(!extracted.some((f) => /gasoline|bluetooth|abs|torsen/i.test(f)));

const researched = await listing.researchPack(pack("PU1388"), {
  timeoutMs: 2000,
  fetchFn: async (url) => {
    if (/nhtsa/i.test(String(url))) {
      return { ok: true, json: async () => ({ Results: [{ DriveType: "4WD/4-Wheel Drive/4x4" }] }) };
    }
    return { ok: true, text: async () => vdpFixture };
  },
});
const after = listing.keyEquipment(researched);
assert.ok(after.length <= 5);
assert.ok(after.includes("Heated Seats"));
assert.ok(after.includes("Apple CarPlay / Android Auto") || after.includes("Apple CarPlay"));
assert.ok(after.includes("Power Seats"));
assert.ok(after.length > listing.keyEquipment(pack("PU1388")).length, "research should add buyer features pack missed");

const timedOut = await listing.researchPack(pack("PU1388"), {
  timeoutMs: 30,
  fetchFn: () => new Promise(() => {}),
});
assert.deepEqual(listing.keyEquipment(timedOut), listing.keyEquipment(pack("PU1388")));

assert.equal(listing.driveFromNhtsa({ Results: [{ DriveType: "FWD/Front-Wheel Drive" }] }), "");
assert.equal(listing.driveFromNhtsa({ Results: [{ DriveType: "AWD/All-Wheel Drive" }] }), "AWD");

assert.equal(listing.vehicleType({ bodyStyle: "Crew Cab 4D", model: "Santa Cruz" }), "truck");
assert.equal(listing.vehicleType({ bodyStyle: "Hatchback 4D", model: "Soul" }), "hatchback");
assert.equal(listing.vehicleType({ bodyStyle: "Passenger Van 4D", model: "Pacifica" }), "van");

console.log("NISSAN 26NU0143 KEY EQUIPMENT\n" + bullets(nissan.body).map((b) => `• ${b}`).join("\n") + "\n");
console.log("HYUNDAI 25HY024 KEY EQUIPMENT\n" + bullets(hyundai.body).map((b) => `• ${b}`).join("\n") + "\n");
console.log("F150 PU1388 PACK ONLY\n" + listing.keyEquipment(pack("PU1388")).map((b) => `• ${b}`).join("\n") + "\n");
console.log("F150 PU1388 AFTER RESEARCH\n" + after.map((b) => `• ${b}`).join("\n") + "\n");
console.log("ok");
