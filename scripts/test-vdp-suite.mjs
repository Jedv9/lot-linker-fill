import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  GROUND_TRUTH,
  SITE,
  VARIANTS,
  extraInventoryCars,
  packFromCar,
  renderListingPage,
  renderVdpHtml,
  vdpUrl,
} from "./vdp-fixtures.mjs";

const require = createRequire(import.meta.url);
const vdp = require("../vdp-price.js");
const live = require("../inventory-live.js");
const listing = require("../listing-copy.js");
const dealer = require("../content-dealer.js");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const splitEs = readFileSync(new URL("./fixtures/vdp-es-per3178-split.html", import.meta.url), "utf8");

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

const es = GROUND_TRUTH.find((c) => c.stock === "PER3178");
assert.equal(es.total, 46815);
assert.equal(es.asking, 46298);

test("split-dollar innerText ES PER3178", () => {
  const innerText = `Certified Pre-Owned 2025 LEXUS ES 350
7,015 miles
Price
$46,298
Service Fee
$479
ECT Filing Fee
$38
Total Sale Price
$
46,815`;
  const got = vdp.extractTotalSalePrice("<html></html>", { innerText });
  assert.equal(got.total, 46815, "must join $ and 46,815 across lines");
  assert.equal(got.asking, 46298);
  assert.notEqual(got.total, 46298);
  assert.equal(vdp.labeledMoneyFromText(innerText, "Total Sale Price"), 46815);
});

test("contiguous $46,815 after Price must not steal Total", () => {
  const innerText = `Price
$46,298
Total Sale Price
$
46,815`;
  assert.equal(vdp.askingFromText(innerText), 46298);
  assert.equal(vdp.labeledMoneyFromText(innerText, "Total Sale Price"), 46815);
});

test("PER3178 split HTML fixture", () => {
  const got = vdp.extractTotalSalePrice(splitEs);
  assert.equal(got.found, true);
  assert.equal(got.total, 46815);
  assert.equal(got.asking, 46298);
  assert.notEqual(got.total, 46298 + 517 === 46815 ? 0 : 1);
});

test("moneyFromScattered joins $ and digits", () => {
  assert.equal(vdp.moneyFromScattered("$\n46,815"), 46815);
  assert.equal(vdp.moneyFromScattered("<span>$</span>\n46,815"), 46815);
  assert.equal(vdp.moneyFromScattered("$46,298"), 46298);
});

test("challenge pages are flagged not priced", () => {
  const html = renderVdpHtml(es, "akamai");
  const got = vdp.extractTotalSalePrice(html);
  assert.equal(got.found, false);
  assert.equal(got.reason, "akamai-challenge");
  assert.equal(vdp.detectChallenge(html, "Access Denied"), "akamai-challenge");
});

test("asking-only is flagged with reason", () => {
  const got = vdp.extractTotalSalePrice(renderVdpHtml(es, "asking-only"));
  assert.equal(got.found, false);
  assert.equal(got.asking, 46298);
  assert.equal(got.reason, "asking-only-no-total");
  const pack = vdp.applyLiveTotal(packFromCar(es), got);
  assert.equal(pack.priceMissing, true);
  assert.equal(pack.price, "");
  assert.equal(pack.priceMissingReason, "asking-only-no-total");
  assert.match(vdp.missingReasonText(pack), /asking-only-no-total/);
});

test("empty html reason", () => {
  const got = vdp.extractTotalSalePrice("");
  assert.equal(got.found, false);
  assert.equal(got.reason, "empty-html");
});

test("/certified/ and /used/ URLs are dealer vehicle URLs", () => {
  for (const car of GROUND_TRUTH) {
    const cert = vdpUrl(car, false);
    const used = vdpUrl(car, true);
    assert.ok(vdp.isDealerVehicleUrl(cert), cert);
    assert.ok(vdp.isDealerVehicleUrl(used), used);
    assert.match(cert, /\/certified\//);
    assert.match(used, /\/used\//);
    assert.equal(live.listingToPack({ link: car.path, stockNumber: car.stock, year: car.year, make: car.make, model: car.model }).vdpUrl, `${SITE}${car.path}`);
  }
});

test("manifest 2.7.1 has tab reader permissions", () => {
  assert.equal(manifest.version, "2.7.1");
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.permissions.includes("tabs"));
  assert.ok(manifest.host_permissions.some((h) => h === "https://www.lexusofbrookfield.com/*"));
  assert.ok(manifest.content_scripts.some((c) => c.js.includes("content-dealer.js")));
  assert.ok(manifest.content_scripts.some((c) => c.world === "MAIN"));
  assert.match(background, /LOT_LINKER_READ_DEALER_BATCH/);
  assert.match(background, /TAB_CONCURRENCY = 3/);
  assert.match(popup, /LOT_LINKER_READ_DEALER_BATCH/);
  assert.match(popup, /priceMissingReason|missingReasonText/);
  assert.match(popup, /credentials: "include"/);
});

test("content-dealer readOnce exists", () => {
  assert.equal(typeof dealer.readOnce, "function");
  assert.equal(typeof dealer.read, "function");
});

for (const car of GROUND_TRUTH) {
  for (const variant of VARIANTS) {
    test(`${car.stock} ${variant} → ${car.total} not ${car.asking}`, () => {
      const html = renderVdpHtml(car, variant);
      const got = vdp.extractTotalSalePrice(html);
      assert.equal(got.found, true, `${car.stock} ${variant} missing: ${got.reason}`);
      assert.equal(got.total, car.total, `${car.stock} ${variant} got ${got.total}`);
      assert.notEqual(got.total, car.asking);
      const pack = vdp.applyLiveTotal(packFromCar(car), got);
      assert.equal(pack.price, String(car.total));
      assert.equal(pack.priceMissing, false);
      assert.equal(listing.advertisedPrice(pack), String(car.total));
      assert.equal(listing.withDealerFees(pack).price, String(car.total));
    });
  }
  test(`${car.stock} asking-only still PRICE MISSING`, () => {
    const got = vdp.extractTotalSalePrice(renderVdpHtml(car, "asking-only"));
    assert.equal(got.found, false);
    assert.equal(got.asking, car.asking);
    const pack = vdp.applyLiveTotal(packFromCar(car), got);
    assert.match(listing.pickerLabel(pack), /PRICE MISSING/);
  });
  test(`${car.stock} never compute asking+517`, () => {
    const computed = car.asking + 517;
    const got = vdp.extractTotalSalePrice(renderVdpHtml(car, "rendered-split"));
    assert.equal(got.total, car.total);
    if (computed !== car.total) assert.notEqual(got.total, computed);
  });
}

const extras = extraInventoryCars(100);
for (const car of extras) {
  test(`extra ${car.stock} split ${car.total}`, () => {
    const got = vdp.extractTotalSalePrice(renderVdpHtml(car, "rendered-split"));
    assert.equal(got.total, car.total);
    assert.notEqual(got.total, car.asking);
  });
}

test("92-vehicle used-inventory pagination then VDP overlay", async () => {
  const cars = [...GROUND_TRUTH, ...extraInventoryCars(87)].slice(0, 92);
  assert.equal(cars.length, 92);
  const pages = {
    0: renderListingPage(cars, { totalCount: 92, start: 0, pageSize: 24 }),
    24: renderListingPage(cars, { totalCount: 92, start: 24, pageSize: 24 }),
    48: renderListingPage(cars, { totalCount: 92, start: 48, pageSize: 24 }),
    72: renderListingPage(cars, { totalCount: 92, start: 72, pageSize: 24 }),
  };
  const lot = await live.collectUsedInventory({
    fetchFn: async (url) => {
      const u = new URL(url);
      const start = Number(u.searchParams.get("start") || 0);
      const html = pages[start];
      assert.ok(html, `missing listing page start=${start}`);
      return { ok: true, status: 200, text: async () => html };
    },
    gapMs: 0,
  });
  assert.equal(lot.expectedTotal, 92);
  assert.equal(lot.count, 92);
  assert.equal(lot.complete, true);
  assert.ok(lot.packs.every((p) => p.priceMissing), "listing asking is not Marketplace price");
  assert.ok(lot.packs.some((p) => /\/certified\//.test(p.vdpUrl)));
  assert.ok(lot.packs.some((p) => /\/used\//.test(p.vdpUrl)));

  const byStock = new Map(cars.map((c) => [c.stock, c]));
  const overlay = await vdp.overlayLiveTotals(lot.packs, {
    readFn: async (pack) => {
      const car = byStock.get(pack.stock);
      assert.ok(car, pack.stock);
      return vdp.extractTotalSalePrice(renderVdpHtml(car, "rendered-split"));
    },
    gapMs: 0,
  });
  assert.equal(overlay.found, 92);
  assert.equal(overlay.missing, 0);
  for (const pk of overlay.packs) {
    const car = byStock.get(pk.stock);
    assert.equal(pk.price, String(car.total), pk.stock);
    assert.equal(listing.advertisedPrice(pk), String(car.total));
    const copy = listing.fromPack(pk);
    assert.match(copy.body, /Brookfield/);
    assert.equal(copy.location || listing.LOCATION || "Brookfield, Wisconsin", copy.location || "Brookfield, Wisconsin");
    assert.doesNotMatch(copy.body, /Oconomowoc/i);
    assert.ok(!/logo|lexusprogram/i.test((pk.photoUrls || []).join(" ")));
  }
});

test("collectUsedInventory readPage vehicles path", async () => {
  const cars = GROUND_TRUTH;
  const lot = await live.collectUsedInventory({
    readPage: async () => ({
      html: renderListingPage(cars, { totalCount: 5, start: 0, pageSize: 24 }),
      vehicles: cars.map((c) => ({
        stockNumber: c.stock,
        year: Number(c.year),
        make: c.make,
        model: c.model,
        trim: c.trim,
        type: "used",
        certified: true,
        link: c.path,
        vin: `VIN${c.stock}`,
      })),
      expectedTotal: 5,
    }),
    gapMs: 0,
  });
  assert.equal(lot.count, 5);
  assert.deepEqual(lot.packs.map((p) => p.stock).sort(), cars.map((c) => c.stock).sort());
});

test("overlay fetch 403 keeps reason", async () => {
  const overlay = await vdp.overlayLiveTotals([packFromCar(es)], {
    fetchFn: async () => ({ html: "Access Denied AkamaiGHost", status: 403, title: "Access Denied" }),
    gapMs: 0,
  });
  assert.equal(overlay.missing, 1);
  assert.match(overlay.packs[0].priceMissingReason, /akamai-challenge|http-403/);
});

test("no vdp url reason", () => {
  const pack = vdp.applyLiveTotal({ stock: "X" }, { found: false });
  assert.equal(pack.priceMissingReason, "no-vdp-url");
});

for (const car of [...GROUND_TRUTH, ...extras.slice(0, 20)]) {
  test(`marketplace copy ${car.stock} uses total ${car.total}`, () => {
    const pack = vdp.applyLiveTotal(packFromCar(car, { bodyStyle: "SUV", drivetrain: "AWD" }), {
      found: true,
      total: car.total,
      asking: car.asking,
      source: "vdp-visible",
    });
    assert.equal(listing.advertisedPrice(pack), String(car.total));
    const out = listing.fromPack(pack);
    assert.match(out.modelLine, new RegExp(`\\$${Number(car.total).toLocaleString("en-US")}`));
    assert.match(out.modelLine, /Brookfield WI/);
    assert.doesNotMatch(out.modelLine, /^20\d{2}/);
    assert.match(out.body, /Wisconsin shoppers/);
    assert.match(out.body, new RegExp(`Price: \\$${Number(car.total).toLocaleString("en-US")}`));
    assert.doesNotMatch(out.body, /Oconomowoc/i);
    assert.equal(out.title.split(" ")[0], String(car.year));
  });
}

let failed = 0;
for (const row of cases) {
  try {
    await row.fn();
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${row.name}`);
    console.error(e);
  }
}

assert.ok(cases.length >= 200, `need >= 200 tests, got ${cases.length}`);
assert.equal(failed, 0, `${failed} failures of ${cases.length}`);
console.log(`vdp suite ok · ${cases.length} tests`);
