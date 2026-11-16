import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const live = require("../inventory-live.js");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/update-inventory.yml", import.meta.url), "utf8");
const listing = readFileSync(new URL("./fixtures/used-listing-page.html", import.meta.url), "utf8");
const listing2 = readFileSync(new URL("./fixtures/used-listing-page2.html", import.meta.url), "utf8");
const esHtml = readFileSync(new URL("./fixtures/es-vdp-pricing.html", import.meta.url), "utf8");
const vdp = require("../vdp-price.js");

const listing3 = listing.replace(/110/g, "3");

assert.equal(live.USED_INVENTORY_PAGE, "https://www.lexusofbrookfield.com/used-inventory/index.htm");
assert.equal(live.extractTotalCount(listing), 110);
assert.equal(live.extractTotalCount(listing3), 3);
assert.equal(live.vehiclesFromListingHtml(listing).length, 2);

const page1 = live.vehiclesFromListingHtml(listing);
const packs0 = page1.map(live.listingToPack);
assert.equal(packs0[0].stock, "PMT3253");
assert.equal(packs0[0].priceMissing, true);
assert.equal(packs0[0].price, "");
assert.match(packs0[0].vdpUrl, /lexusofbrookfield\.com/);

async function pages({ start } = {}) {
  const html = !start ? listing3 : listing2;
  return {
    ok: true,
    status: 200,
    text: async () => html,
  };
}

const collected = await live.collectUsedInventory({
  fetchFn: async (url) => {
    const u = new URL(url);
    const start = Number(u.searchParams.get("start") || 0);
    return pages({ start });
  },
  gapMs: 0,
});
assert.equal(collected.expectedTotal, 3);
assert.equal(collected.count, 3);
assert.equal(collected.complete, true);
assert.deepEqual(
  collected.packs.map((p) => p.stock).sort(),
  ["28159A", "PMT3253", "PRH2577A"].sort()
);
assert.ok(collected.packs.every((p) => p.priceMissing), "listing asking is not the Marketplace price");

const overlay = await vdp.overlayLiveTotals(collected.packs, {
  fetchFn: async (url) => (/ES-39bb1cb7|es\.htm/i.test(url) ? esHtml : ""),
  gapMs: 0,
});
assert.ok(overlay.missing >= 1);
assert.ok(overlay.packs.every((p) => p.priceMissing || p.totalSalePrice));

const prev = [{ stock: "PMT3253", features: ["AWD"], keyEquipment: ["AWD"], photoUrls: ["https://pictures.dealer.com/l/lexusofbrookfieldwi/keep.jpg"] }];
const merged = live.mergeLiveWithPrevious(prev, collected.packs);
const nx = merged.find((p) => p.stock === "PMT3253");
assert.deepEqual(nx.features, ["AWD"]);
assert.ok(nx.priceMissing);

let blocked = false;
try {
  await live.collectUsedInventory({
    fetchFn: async () => ({ ok: false, status: 403, text: async () => "Forbidden" }),
    gapMs: 0,
  });
} catch (e) {
  blocked = e.blocked === true && e.status === 403;
}
assert.equal(blocked, true, "HTTP 403 from used-inventory must fail fast as blocked");

assert.match(popup, /collectUsedInventory/);
assert.match(popup, /used-inventory/);
assert.match(popup, /overlayVdpTotals\(\[selected\]\)/);
assert.match(popupHtml, /inventory-live\.js/);
assert.match(popupHtml, /id="tabPosted"/);
assert.match(scraper, /isBlockedHttp|HTTP 403/);
assert.match(scraper, /process\.exit\(0\)/);
assert.match(workflow, /timeout-minutes: 25/);
assert.match(workflow, /HTTP 403/);

console.log(`inventory live ok · used-inventory ${collected.count}/${collected.expectedTotal} · 403 fail-fast`);
