/**
 * Overlay each pack.price with the live VDP Total Sale Price.
 * Does not add $479+$38. Missing totals are flagged, never invented.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { header, isRetryableHttp, retryDelayMs, sleep } from "./http-retry.mjs";

const require = createRequire(import.meta.url);
const vdpPrice = require("../vdp-price.js");

const MAX_RETRIES = 8;

const VDP_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

export async function fetchVdpHtml(url, { fetchFn = fetch } = {}) {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetchFn(url, { headers: VDP_HEADERS });
    lastStatus = res.status;
    const html = await res.text();
    if (!isRetryableHttp(lastStatus, html) && html.length > 1500) return html;
    if (attempt === MAX_RETRIES) break;
    const headers = typeof res.headers?.entries === "function" ? Object.fromEntries(res.headers.entries()) : {};
    const delay = retryDelayMs(headers, attempt, { baseMs: 15000, capMs: 90000 });
    console.log(`VDP HTTP ${lastStatus} ${url} — wait ${delay}ms (Retry-After=${header(headers, "retry-after") || "none"})`);
    await sleep(delay);
  }
  throw new Error(`blocked fetching ${url} (last HTTP ${lastStatus})`);
}

export async function overlayLiveTotals(packs, { fetchFn = fetch, onProgress } = {}) {
  return vdpPrice.overlayLiveTotals(packs, {
    fetchFn: async (url) => fetchVdpHtml(url, { fetchFn }),
    onProgress,
    gapMs: 2500,
  });
}

async function main() {
  const doc = JSON.parse(fs.readFileSync("packs.json", "utf8"));
  const result = await overlayLiveTotals(doc.packs, {
    onProgress: ({ i, total, stock }) => {
      if (i % 5 === 0 || i + 1 === total) console.log(`VDP total ${i + 1}/${total} ${stock || ""}`);
    },
  });
  doc.packs = result.packs;
  doc.priceNote = "price is the live VDP Total Sale Price; never computed as asking + fees";
  doc.vdpPricesAt = new Date().toISOString();
  doc.vdpPriceFound = result.found;
  doc.vdpPriceMissing = result.missing;
  fs.writeFileSync("packs.json", JSON.stringify(doc));
  console.log(`Updated packs.json — ${result.found} live Total Sale Price, ${result.missing} missing of ${result.packs.length}`);
  const sample = result.packs.filter((p) => !p.priceMissing).slice(0, 5);
  for (const p of sample) {
    console.log(`  ${p.stock}  ${p.year} ${p.make} ${p.model}  our=${p.price}  vdpTotal=${p.totalSalePrice}  source=${p.priceSource}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
