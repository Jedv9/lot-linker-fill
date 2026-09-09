import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const fixture = new URL("./nav-gate-fixture.html", import.meta.url);
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

const gate = report.gate;
assert.equal(gate.gated, true, "missing vehicle type must gate other fields");
assert.ok(!gate.filled.includes("vehicleType"), "vehicle type must be missed when control is absent");
assert.ok(gate.missed.includes("vehicleType"));
assert.ok(gate.missed.includes("year"));
assert.ok(gate.missed.includes("make"));
assert.ok(gate.missed.includes("price"));
assert.ok(gate.missed.includes("model"));
assert.equal(gate.year, "", "year must stay empty when vehicle type is gated");
assert.equal(gate.make, "", "make must stay empty when vehicle type is gated");
assert.equal(gate.price, "", "price must stay empty when vehicle type is gated");
assert.equal(gate.model, "", "model must stay empty when vehicle type is gated");
assert.equal(gate.vin, "DO-NOT-TOUCH");
assert.equal(gate.homeClicks, 0, "gate path must not click Home");
assert.equal(gate.postClicks, 0);
assert.equal(gate.nextClicks, 0);
assert.equal(gate.marketClicks, 0);
assert.equal(gate.browseClicks, 0);
assert.equal(gate.documentEscape, 0, "must not dispatch Escape on document");

const tiles = report.tiles;
assert.equal(tiles.gated, false, `tiles should not gate: ${JSON.stringify(tiles)}`);
assert.ok(tiles.filled.includes("vehicleType"), "tile Car/Truck must fill first");
assert.equal(tiles.vehicleType, "Car/Truck");
assert.ok(tiles.filled.includes("year"), "waitForOptions year path");
assert.equal(tiles.year, "2012");
assert.equal(tiles.vin, "DO-NOT-TOUCH");
assert.equal(tiles.homeClicks, 0, "tile path must not click Home");
assert.equal(tiles.postClicks, 0);
assert.equal(tiles.nextClicks, 0);
assert.equal(tiles.browseClicks, 0);
assert.equal(tiles.documentEscape, 0, "waitForOptions path must not Escape-close the composer");
assert.equal(tiles.escapedAfterClose, 0, "closeOpenListbox must not dispatch Escape on document");
assert.equal(tiles.waitBefore, 0, "waitForOptions is empty before the delayed list opens");
assert.ok(tiles.waitAfter >= 1, "waitForOptions must see delayed year options");

console.log("nav-gate fixture ok · gated empty fields · tiles Car/Truck · no home/Escape");
