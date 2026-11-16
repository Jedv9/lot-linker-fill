import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { GROUND_TRUTH, extraInventoryCars, packFromCar } from "./vdp-fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = url.pathname;
  if (rel === "/") rel = "/scripts/fill-fixture.html";
  const file = join(root, rel.replace(/^\/+/, ""));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("no");
    return;
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const cars = [...GROUND_TRUTH, ...extraInventoryCars(15)].slice(0, 20);
const packs = cars.map((car) => {
  const priced = packFromCar(car, {
    price: String(car.total),
    totalSalePrice: String(car.total),
    priceMissing: false,
    priceSource: "vdp-total",
    photoUrls: [
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0001/${car.stock}-1.jpg`,
      "https://pictures.dealer.com/l/lexusprogram/0991/5e2600a01524afb803de30925275cf48x.jpg",
    ],
  });
  return priced;
});

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.goto(`${origin}/scripts/fill-fixture.html?pack=none`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.runFill === "function" && typeof window.LotLinkerFill?.fillPack === "function");

let passed = 0;
for (const pack of packs) {
  const row = await page.evaluate(async (p) => {
    const listing = window.LotLinkerListing.packToListing(p);
    const photos = window.LotLinkerPhotos.filterPhotoUrls(p.photoUrls || []);
    const result = await window.runFill(p, p.stock, { mileage: p.mileage });
    return {
      ok: result.ok,
      fields: result.fields,
      filled: result.result.filled,
      missed: result.result.missed,
      listing,
      photos,
    };
  }, pack);
  assert.equal(row.fields.year, pack.year, `${pack.stock} year`);
  assert.equal(row.fields.make, pack.make, `${pack.stock} make`);
  assert.equal(row.fields.price, String(pack.price), `${pack.stock} price`);
  assert.equal(row.fields.mileage, String(pack.mileage), `${pack.stock} mileage`);
  assert.equal(row.fields.location, "Brookfield, Wisconsin", `${pack.stock} location`);
  assert.doesNotMatch(row.fields.location, /Oconomowoc/i);
  assert.equal(row.fields.vin, "DO-NOT-TOUCH");
  assert.match(row.fields.description, /Wisconsin shoppers/);
  assert.ok(row.filled.includes("price"), `${pack.stock} filled price`);
  assert.ok(!row.photos.some((u) => /lexusprogram|logo|favicon/i.test(u)), `${pack.stock} logo leaked`);
  assert.ok(row.photos.length >= 1, `${pack.stock} kept a real photo URL`);
  passed += 1;
}

await browser.close();
server.close();

const mockFb = readFileSync(new URL("./fixtures/marketplace-vehicle-form.html", import.meta.url), "utf8");
const ext = fileURLToPath(new URL("..", import.meta.url));
const userData = mkdtempSync(join(tmpdir(), "lot-linker-fb-"));
const context = await chromium.launchPersistentContext(userData, {
  headless: false,
  args: [
    "--headless=new",
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
const fbPage = await context.newPage();
await fbPage.route("https://www.facebook.com/**", async (route) => {
  await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: mockFb });
});
await fbPage.goto("https://www.facebook.com/marketplace/create/vehicle", { waitUntil: "domcontentloaded" });
await fbPage.waitForTimeout(500);

for (const car of GROUND_TRUTH) {
  const pack = packFromCar(car, {
    price: String(car.total),
    totalSalePrice: String(car.total),
    priceMissing: false,
    priceSource: "vdp-total",
    photoUrls: [],
    vdpUrl: "",
  });
  const tabId = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/*" });
    return tabs[0]?.id || 0;
  });
  const res = await sw.evaluate(async ({ tabId, pack }) => {
    return chrome.tabs.sendMessage(tabId, { type: "LOT_LINKER_FILL", pack });
  }, { tabId, pack });
  assert.ok(res?.ok || res?.filled, `${car.stock} fill response ${JSON.stringify(res)}`);
  const fields = await fbPage.evaluate(() => window.snapshotForm());
  assert.equal(fields.year, pack.year, `${car.stock} year`);
  assert.equal(fields.make, pack.make, `${car.stock} make`);
  assert.equal(fields.price, String(car.total), `${car.stock} price`);
  assert.equal(fields.mileage, String(pack.mileage), `${car.stock} mileage`);
  assert.equal(fields.location, "Brookfield, Wisconsin", `${car.stock} location`);
  assert.equal(fields.vin, "DO-NOT-TOUCH");
  assert.match(fields.description, /Wisconsin shoppers/);
  passed += 1;
}

await context.close();
assert.ok(passed >= 25, `expected 20 script fills + 5 unpacked, got ${passed}`);
console.log(`e2e marketplace fill ok · ${passed} cars · never posted`);
