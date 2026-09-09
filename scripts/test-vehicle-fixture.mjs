import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const fixture = new URL("./fill-fixture.html", import.meta.url);
const chrome = spawnSync(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=40000",
    "--dump-dom",
    fixture.href,
  ],
  { encoding: "utf8", timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
);

assert.equal(chrome.status, 0, `chrome failed: ${chrome.stderr || chrome.stdout.slice(0, 500)}`);
const html = chrome.stdout;
const m = html.match(/data-report="([^"]+)"/);
assert.ok(m, "fixture did not write data-report");
const report = JSON.parse(m[1].replace(/&quot;/g, '"'));
assert.ok(report.length >= 1, "expected fixture fill reports");

for (const row of report) {
  assert.equal(row.ok, true, `${row.label} fixture failed: ${JSON.stringify(row)}`);
  assert.ok(row.filled.includes("vehicleType"), `${row.label} vehicle type`);
  assert.equal(row.vehicleType, "Car/Truck");
  assert.ok(row.filled.includes("year"), `${row.label} year`);
  assert.ok(row.filled.includes("make"), `${row.label} make`);
  assert.ok(row.filled.includes("price"), `${row.label} price`);
  assert.ok(row.filled.includes("mileage"), `${row.label} mileage`);
  assert.ok(row.filled.includes("bodyStyle"), `${row.label} body style`);
  assert.ok(row.filled.includes("exterior"), `${row.label} exterior`);
  assert.ok(row.filled.includes("interior"), `${row.label} interior`);
  assert.ok(row.filled.includes("model"), `${row.label} model`);
  assert.ok(row.filled.includes("description"), `${row.label} description`);
  assert.ok(!row.filled.includes("vin"), `${row.label} must not fill VIN`);
  assert.ok(!row.filled.includes("condition"), `${row.label} must not fill condition`);
  assert.deepEqual(row.missed, []);
  assert.equal(row.descriptionFilled, true, `${row.label} Description must be filled, not missed`);
  assert.ok(row.descriptionHit, `${row.label} must report the Description selector`);
  assert.equal(row.model, row.modelLine);
  assert.equal(row.descriptionHasNewlines, true);
  assert.equal(row.titleStatus, "Clean");
  assert.equal(row.cleanTitle, false);
  assert.equal(row.condition, "");
  assert.equal(row.vin, "DO-NOT-TOUCH");
  if (row.label === "Raptor") {
    assert.equal(row.model, "F-150 SVT Raptor | 4WD | $26,900 | Oconomowoc WI");
    assert.equal(row.year, "2012");
    assert.equal(row.make, "Ford");
    assert.equal(row.price, "26900");
    assert.equal(row.mileage, "87000");
    assert.equal(row.bodyStyle, "Truck");
    assert.equal(row.exterior, "Black");
    assert.equal(row.interior, "Black");
    assert.equal(row.fuel, "Gasoline");
  }
  if (row.label === "Nissan") {
    assert.equal(row.year, "2026");
    assert.equal(row.make, "Nissan");
    assert.equal(row.price, "30470");
    assert.equal(row.mileage, "300");
    assert.equal(row.bodyStyle, "Sedan");
    assert.equal(row.exterior, "Gray");
    assert.equal(row.interior, "Black");
    assert.equal(row.fuel, "Gasoline");
  }
  if (row.label === "Year2027") {
    assert.equal(row.year, "2026");
    assert.equal(row.make, "Hyundai");
    assert.equal(row.bodyStyle, "SUV");
    assert.equal(row.exterior, "Green");
    assert.equal(row.interior, "Tan");
    assert.equal(row.fuel, "Electric");
    assert.equal(row.mileage, "300");
  }
  if (row.label === "LowMiles") {
    assert.equal(row.mileage, "300");
    assert.equal(row.year, "2016");
    assert.equal(row.make, "Hyundai");
    assert.equal(row.price, "12995");
    assert.equal(row.bodyStyle, "Sedan");
    assert.equal(row.exterior, "White");
    assert.equal(row.interior, "Black");
  }
  if (row.label === "MidMiles") {
    assert.equal(row.mileage, "12000");
    assert.equal(row.year, "2016");
    assert.equal(row.make, "Hyundai");
    assert.equal(row.price, "12995");
    assert.equal(row.bodyStyle, "Sedan");
    assert.equal(row.exterior, "White");
    assert.equal(row.interior, "Black");
  }
}

console.log("vehicle fixture fills\n" + report.map((r) => `${r.label}: ${r.model} · via ${r.descriptionHit}`).join("\n"));
console.log("ok");
