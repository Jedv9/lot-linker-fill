import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { GROUND_TRUTH, renderVdpHtml, vdpUrl } from "./vdp-fixtures.mjs";

const vdpSrc = readFileSync(new URL("../vdp-price.js", import.meta.url), "utf8");
const dealerSrc = readFileSync(new URL("../content-dealer.js", import.meta.url), "utf8");
const splitEs = readFileSync(new URL("./fixtures/vdp-es-per3178-split.html", import.meta.url), "utf8");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let passed = 0;

async function extractInPage(html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: vdpSrc });
    await page.addScriptTag({ content: dealerSrc });
    return await page.evaluate(() => {
      const extracted = window.LotLinkerVdpPrice.extractFromDocument(document, {
        html: document.documentElement.outerHTML,
        title: document.title,
        ddc: window.DDC || window.__inventory || null,
        innerText: document.body.innerText,
      });
      const once = window.LotLinkerDealerRead.readOnce("vdp");
      return {
        extracted,
        once,
        innerText: document.body.innerText,
      };
    });
  } finally {
    await page.close();
  }
}

const htmlCases = [
  { name: "PER3178 live split fixture file", html: splitEs, total: 46815, asking: 46298 },
  ...GROUND_TRUTH.flatMap((car) =>
    ["rendered-split", "widget-only", "contiguous", "unrendered-dprice", "inner-text-only"].map((variant) => ({
      name: `${car.stock} ${variant}`,
      html: renderVdpHtml(car, variant),
      total: car.total,
      asking: car.asking,
    }))
  ),
];

for (const row of htmlCases) {
  const got = await extractInPage(row.html);
  assert.equal(got.extracted.total, row.total, `${row.name} document total`);
  assert.equal(got.extracted.found, true, `${row.name} found`);
  assert.notEqual(got.extracted.total, row.asking, `${row.name} must not use asking`);
  if (/Total Sale Price/.test(got.innerText) && /\$\s*\n\s*[\d,]/.test(got.innerText)) {
    assert.equal(
      got.extracted.total,
      row.total,
      `${row.name} split-dollar innerText still ${row.total}`
    );
  }
  passed += 1;
}

const asking = await extractInPage(renderVdpHtml(GROUND_TRUTH[0], "asking-only"));
assert.equal(asking.extracted.found, false);
assert.equal(asking.extracted.reason, "asking-only-no-total");
passed += 1;

const denied = await extractInPage(renderVdpHtml(GROUND_TRUTH[0], "akamai"));
assert.equal(denied.extracted.found, false);
assert.equal(denied.extracted.reason, "akamai-challenge");
passed += 1;

await browser.close();

const ext = fileURLToPath(new URL("..", import.meta.url));
const userData = mkdtempSync(join(tmpdir(), "lot-linker-ext-"));
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
await (context.serviceWorkers()[0] || context.waitForEvent("serviceworker"));
const page = await context.newPage();
await page.route("https://www.lexusofbrookfield.com/**", async (route) => {
  const url = route.request().url();
  const car = GROUND_TRUTH.find((c) => url.includes(c.path)) || GROUND_TRUTH[0];
  await route.fulfill({ status: 200, contentType: "text/html", body: renderVdpHtml(car, "rendered-split") });
});
for (const car of GROUND_TRUTH) {
  await page.goto(vdpUrl(car), { waitUntil: "domcontentloaded" });
  const got = await page.waitForFunction(() => {
    const api = window.LotLinkerDealerRead;
    if (!api) return null;
    const row = api.readOnce("vdp");
    return row?.extracted?.found ? row.extracted : null;
  });
  const extracted = await got.jsonValue();
  assert.equal(extracted.total, car.total, `unpacked ${car.stock}`);
  assert.notEqual(extracted.total, car.asking);
  passed += 1;
}
await context.close();

console.log(`e2e dealer DOM ok · ${passed} cases · playwright ${fileURLToPath(import.meta.url)}`);
assert.ok(passed >= 20, `expected 20+ DOM cases, got ${passed}`);
