import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const fixture = new URL("./popup-posted-fixture.html", import.meta.url);
const chrome = spawnSync(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=15000",
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
assert.equal(report.ok, true, report.error || JSON.stringify(report));
assert.equal(report.defaultFilter, "not");
assert.equal(report.initialLeft, "2 left");
assert.deepEqual(report.initialStocks, ["26NU0143", "26NU0156"]);
assert.equal(report.afterMarkLeft, "1 left");
assert.deepEqual(report.storedAfterMark, ["26NU0143"]);
assert.equal(report.refreshKeptMarks, true);
assert.equal(report.afterUnmarkLeft, "2 left");
assert.equal(report.searchStillThere, true);
assert.equal(report.storeStillThere, true);

console.log("popup posted-tracker fixture ok");
