import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { toPack } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));
const vdpFixture = readFileSync(new URL("./vdp-feature-fixture.html", import.meta.url), "utf8");

function bullets(body) {
  return body.split("\n").filter((l) => l.startsWith("• ")).map((l) => l.slice(2));
}

function assertLayout(body) {
  const lines = body.split("\n");
  assert.match(lines[0], /^Wisconsin shoppers looking for a \S+ under \$[\d,]+:$/);
  assert.equal(lines[1], "");
  assert.match(lines[2], / is available at Lexus of Brookfield in Brookfield, Wisconsin\.$/);
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

const raptorPack = {
  stock: "PU1392",
  year: "2012",
  make: "Ford",
  model: "F-150",
  trim: "SVT Raptor",
  bodyStyle: "Crew Cab 4D",
  mileage: "109782",
  odometerMiles: 109782,
  vin: "1FTWX1R64CFA00000",
  condition: "USED",
  exterior: "Black",
  interior: "Black",
  fuel: "Gasoline",
  drivetrain: "4WD",
  price: "26900",
  rooftop: "Lexus of Brookfield",
  vdpUrl: "https://www.lexusofbrookfield.com/used/Ford/2012-Ford-F-150.htm",
  features: ["Heated Seats", "Backup Camera", "4WD"],
};

assert.equal(
  listing.pickerLabel(raptorPack),
  "PU1392 · 2012 Ford F-150 SVT Raptor · 109,782 mi · $26,900"
);
assert.equal(listing.mileageLabel(raptorPack), "109,782 mi");
assert.equal(
  listing.buildModelLine(raptorPack),
  "F-150 SVT Raptor | 4WD | $26,900 | Brookfield WI"
);
assert.doesNotMatch(listing.buildModelLine(raptorPack), /2012|Ford/);
assert.equal(
  listing.buildTitle(raptorPack),
  "2012 Ford F-150 SVT Raptor | 4WD | $26,900 | Brookfield WI"
);
const raptorListing = listing.packToListing(raptorPack);
assert.equal(raptorListing.modelLine, "F-150 SVT Raptor | 4WD | $26,900 | Brookfield WI");
assert.match(raptorListing.body, /Wisconsin shoppers looking for a truck under \$26,900:/);
assert.match(raptorListing.body, /2012 Ford F-150 is available at Lexus of Brookfield/);
assert.doesNotMatch(raptorListing.body, /Boucher|Lake Country|Oconomowoc/);
assert.ok(raptorListing.body.includes("\n\n"), "description must keep blank lines");
assertLayout(raptorListing.body);

const cpoPack = toPack(cpo);
cpoPack.features = [
  "Heated & Ventilated Seats",
  "Wireless Apple CarPlay/Wireless Android Auto",
  "Intuitive Parking Assist",
  "Power driver seat",
  "Power moonroof",
];
const cpoListing = listing.fromPack(cpoPack);
assert.equal(
  listing.pickerLabel(cpoPack),
  "PMT3253 · 2024 Lexus NX 350 Premium · 17,009 mi · $43,999"
);
assert.doesNotMatch(listing.mileageLabel(cpoPack), /NEW/);
assert.equal(cpoListing.modelLine, "NX 350 Premium | AWD | $43,999 | Brookfield WI");
assert.doesNotMatch(cpoListing.modelLine, /2024|Lexus/);
assert.equal(cpoListing.title, "2024 Lexus NX 350 Premium | AWD | $43,999 | Brookfield WI");
assert.match(cpoListing.body, /L\/Certified Pre-Owned/);
assert.match(cpoListing.body, /Lexus of Brookfield in Brookfield, Wisconsin/);
assert.ok(listing.keyEquipment(cpoPack).length >= 3);
assert.doesNotMatch(cpoListing.body, /Bluetooth|Satellite Radio|Gasoline|Automatic transmission/i);
assertLayout(cpoListing.body);

const usedMulti = listing.fromPack({
  stock: "28159A",
  year: "2024",
  make: "Genesis",
  model: "GV80",
  trim: "3.5T",
  bodyStyle: "SUV",
  mileage: "20520",
  condition: "USED",
  certified: false,
  drivetrain: "AWD",
  price: "45507",
  rooftop: "Lexus of Brookfield",
  vdpUrl: "https://www.lexusofbrookfield.com/used/Genesis/2024-Genesis-GV80-82754bd9ac180097404c2aaa144db3e4.htm",
  features: ["Heated & Ventilated Front Bucket Seats", "Apple CarPlay", "Android Auto", "Surround View Monitor", "Leather Seats"],
});
assert.equal(usedMulti.modelLine, "GV80 3.5T | AWD | $45,507 | Brookfield WI");
assert.doesNotMatch(usedMulti.body, /L\/Certified Pre-Owned/);
assert.match(usedMulti.body, /2024 Genesis GV80 is available at Lexus of Brookfield/);
assertLayout(usedMulti.body);

const thin = listing.fromPack({
  stock: "PU1388",
  year: "2018",
  make: "Ford",
  model: "F-150",
  trim: "XLT",
  bodyStyle: "Crew Cab 4D",
  mileage: "87000",
  condition: "USED",
  drivetrain: "4WD",
  price: "26900",
  rooftop: "Lexus of Brookfield",
  features: ["Heated Seats", "Backup Camera"],
});
assert.deepEqual(listing.keyEquipment({
  features: ["Heated Seats", "Backup Camera"],
  drivetrain: "4WD",
}), [
  "Heated Seats",
  "Backup Camera",
  "4WD",
]);
assert.ok(listing.needsResearch({ features: ["Heated Seats", "Backup Camera"], drivetrain: "4WD", vdpUrl: "https://www.lexusofbrookfield.com/used/x.htm" }));
assertLayout(thin.body);

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

const researched = await listing.researchPack(
  { features: ["Heated Seats", "Backup Camera"], drivetrain: "4WD", vdpUrl: "https://www.lexusofbrookfield.com/used/x.htm", vin: "1FTWX1R64CFA00000" },
  {
    timeoutMs: 2000,
    fetchFn: async (url) => {
      if (/nhtsa/i.test(String(url))) {
        return { ok: true, json: async () => ({ Results: [{ DriveType: "4WD/4-Wheel Drive/4x4" }] }) };
      }
      return { ok: true, text: async () => vdpFixture };
    },
  }
);
const after = listing.keyEquipment(researched);
assert.ok(after.length <= 5);
assert.ok(after.includes("Heated Seats"));
assert.ok(after.includes("Apple CarPlay / Android Auto") || after.includes("Apple CarPlay"));
assert.ok(after.includes("Power Seats"));
assert.ok(after.length > 3, "research should add buyer features pack missed");

const timedOut = await listing.researchPack(
  { features: ["Heated Seats", "Backup Camera"], drivetrain: "4WD", vdpUrl: "https://www.lexusofbrookfield.com/used/x.htm" },
  {
    timeoutMs: 30,
    fetchFn: () => new Promise(() => {}),
  }
);
assert.deepEqual(listing.keyEquipment(timedOut), ["Heated Seats", "Backup Camera", "4WD"]);

assert.equal(listing.driveFromNhtsa({ Results: [{ DriveType: "FWD/Front-Wheel Drive" }] }), "");
assert.equal(listing.driveFromNhtsa({ Results: [{ DriveType: "AWD/All-Wheel Drive" }] }), "AWD");

assert.equal(listing.vehicleType({ bodyStyle: "Crew Cab 4D", model: "Santa Cruz" }), "truck");
assert.equal(listing.vehicleType({ bodyStyle: "Hatchback 4D", model: "Soul" }), "hatchback");
assert.equal(listing.vehicleType({ bodyStyle: "Passenger Van 4D", model: "Pacifica" }), "van");
assert.equal(listing.vehicleType({ bodyStyle: "SUV", model: "NX" }), "SUV");
assert.equal(listing.vehicleType({ bodyStyle: "Sedan", model: "ES" }), "sedan");

assert.equal(listing.storeName({ make: "Hyundai" }), "Lexus of Brookfield");
assert.equal(listing.isCertified(cpoPack), true);
assert.equal(listing.isCertified({ condition: "USED" }), false);

console.log("CPO PMT3253 KEY EQUIPMENT\n" + bullets(cpoListing.body).map((b) => `• ${b}`).join("\n") + "\n");
console.log("GENESIS 28159A KEY EQUIPMENT\n" + bullets(usedMulti.body).map((b) => `• ${b}`).join("\n") + "\n");
console.log("ok");
