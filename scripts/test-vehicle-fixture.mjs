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
    "--virtual-time-budget=12000",
    "--dump-dom",
    fixture.href,
  ],
  { encoding: "utf8", timeout: 45000, maxBuffer: 20 * 1024 * 1024 }
);

assert.equal(chrome.status, 0, `chrome failed: ${chrome.stderr || chrome.stdout.slice(0, 500)}`);
const html = chrome.stdout;
const m = html.match(/data-report="([^"]+)"/);
assert.ok(m, "fixture did not write data-report");
const report = JSON.parse(m[1].replace(/&quot;/g, '"'));
assert.ok(report.length >= 1, "expected fixture fill reports");

for (const row of report) {
  assert.equal(row.ok, true, `${row.label} fixture failed: ${JSON.stringify(row)}`);
  assert.deepEqual(row.filled, ["model", "description"]);
  assert.deepEqual(row.missed, []);
  assert.equal(row.descriptionFilled, true, `${row.label} Description must be filled, not missed`);
  assert.ok(row.descriptionHit, `${row.label} must report the Description selector`);
  assert.equal(row.model, row.modelLine);
  assert.equal(row.descriptionHasNewlines, true);
  assert.equal(row.titleStatus, "Clean");
  if (row.label === "Raptor") {
    assert.equal(row.model, "F-150 SVT Raptor | 4WD | $26,900 | Oconomowoc WI");
    assert.equal(row.year, "2012");
    assert.equal(row.make, "Ford");
    assert.equal(row.mileage, "87000");
  }
}

console.log("vehicle fixture fills\n" + report.map((r) => `${r.label}: ${r.model} · via ${r.descriptionHit}`).join("\n"));
console.log("ok");
