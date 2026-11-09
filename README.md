# Lot Linker Fill

Chrome MV3 extension for **Lexus of Brookfield** pre-owned inventory (used + L/Certified). Pick a stock number and **Fill** Facebook Marketplace vehicle **Year**, **Make**, **Price**, **Mileage**, **Body style**, **Exterior color**, **Interior color**, **Fuel type**, **Model**, **Description**, and **photos** in one click. You always hit Post. VIN, clean title, and vehicle condition are never touched.

This build is pre-owned only. New Lexus inventory is not loaded. Pre-owned includes other makes on the Brookfield lot, not only Lexus. L/Certified units that appear in pre-owned / certified inventory are included.

**Repo:** https://github.com/Jedv9/lot-linker-fill

**Dealer (public site):** [Lexus of Brookfield](https://www.lexusofbrookfield.com/) · 20001 W Bluemound Rd, Brookfield, WI 53045 · Sales 262-320-4619

## Install
1. Unzip `LotLinker.zip` (or `dist/LotLinker.zip` from `bash scripts/build-zip.sh`)
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → the `lot-linker-fill` folder (`manifest.json` is in that folder)
3. If an older Lot Linker is already loaded, click **Reload** on that card. If you previously used Lake Country packs or the 43-unit Brookfield seed, click **Refresh packs** (or Remove and Load unpacked again) so Chrome storage does not keep an old override.

## Use
1. Open Facebook Marketplace → create **vehicle** listing (`/marketplace/create/vehicle` or equivalent)
2. Open the extension, search by stock / VIN / model — each row shows mileage and price
3. Click **Fill** (Vehicle type Car/Truck first, then Year, Make, Price, Mileage, body, colors, fuel, Model, description, photos). Fill also marks that stock as listed on Marketplace.
4. You click Post — the extension never publishes
5. When a listed car leaves the Brookfield site, **Sold — take these down** shows year/make/model/trim, stock, VIN last 6, last advertised total price, and the date it was detected gone. Click **Taken down** after you remove the Facebook listing. The toolbar icon badge is the count still waiting. Use **Listed on Marketplace** on a stock if you listed it without Fill.

Jed should not download photos separately. **Save photos (fallback)** is only if Marketplace’s picker misses (Facebook UI change / no file input).

Model line and description are generated at fill time from pack fields (`year`, `make`, `model`, `trim`, `price`, `mileage`, `stock`, `rooftop`, `bodyStyle`, `drivetrain`, `engine` if present, plus verified features from `features` / `equipment` / pack `body` standouts). **Year**, **Make**, **Price**, **Mileage**, **Body style**, **Exterior color**, **Interior color**, and **Fuel type** are written into their own Marketplace fields when the pack has a value we can map. VIN is never filled. The clean-title checkbox and vehicle condition are left alone.

## Model line (Facebook vehicle create)
`{Model} {Trim} | {engine or drivetrain or body} | ${price} | Brookfield WI`

Example: `NX 350 Premium | AWD | $44,516 | Brookfield WI` — no year, no make in this string. Year and Make are filled in their own dropdowns. Price field gets digits only (`44516`), not `$44,516`. Advertised price is the dealer **Total Sale Price**: vehicle price plus the confirmed $479 service fee and $38 filing fee ($517). Sales tax, title, and registration are not added.

## Title
Still built as `{Year} {Make} {Model} {Trim} | {engine or drivetrain or body} | ${price} | Brookfield WI` for preview / other use. Vehicle listings do not have a Title field.

## Description
Multi-line Wisconsin shopper copy: vehicle type, Lexus of Brookfield, price, mileage, stock, up to **5** Key equipment bullets in Jed’s locked order (heated seats → CarPlay/Android Auto → camera/BSM/sensors → power seats → AWD/4WD, then leather / premium audio / moonroof / adaptive cruise / remote start / power liftgate). L/Certified units are labeled in the availability line. Never invent; never baseline fluff.

If a stock has fewer than 5 verified hits, the popup researches that vehicle’s VDP (`vdpUrl`) and NHTSA VIN decode (AWD/4WD only), 10s timeout, then falls back to pack features.

## Photos
Fill fetches unit photos from pack `photoUrls` and/or the VDP page (`pictures.dealer.com` and a few dealer CDNs). A red dealer banner is cropped only when that banner is actually detected — Brookfield unit photos are not force-cropped. Status reports `filled model · description · N photos` or `missed: photos` with a reason.

The service worker does the fetch so Facebook is not sent as `Referer`. Host permissions cover the Lexus of Brookfield site and photo CDNs. The content script waits/retries for the photo picker (slow create-page loads) and never clicks Post / Publish / Next.

Facebook caveats: the picker is often a hidden file input behind “Add photos”. Marketplace may cap how many images stick; extras are dropped by FB, not posted. If the composer has not reached the vehicle photo step, Fill reports a missed photo picker — stay on create/vehicle and retry.

## Packs
Bundled `packs.json` loads on open. **Refresh packs** pulls the latest `packs.json` from this repo (optional `chrome.storage` override). Packs from the old Lake Country rooftops are ignored so they cannot silently replace Brookfield inventory. Refresh also compares the stock numbers the extension had stored before against the new file and adds anything that vanished to the sold list (even if `packs.json` `sold` missed it). Incomplete remotes are skipped so a partial pull is never treated as a mass sale.

`packs.json` keeps a rolling `soldHistory` (about 60 days, with `detectedAt`) plus the last-run `sold` / `soldSinceLast` lists. The popup keeps undismissed rows in `chrome.storage` until Jed clicks **Taken down**.

Weekly GitHub Action: `scripts/scrape-inventory.mjs` reads the public dealer.com listing pages (HTML + JSON-LD, including `?start=` pagination and `?make=` filters):

- Pre-owned (all makes): https://www.lexusofbrookfield.com/used-inventory/index.htm
- L/Certified: https://www.lexusofbrookfield.com/l-certified-inventory/index.htm

Completeness is the used-inventory total (`Browse our inventory of N` / make-facet sum), currently 110 across 24 makes. CPO units are a subset of that pre-owned lot. The HTML sitemap is **not** a complete inventory export (Lexus CPO/used only). New inventory (`/new-inventory/index.htm`, `/new/`, `/electric-new/`) is excluded. VDP URLs look like `/used/{Make}/{Year}-{Make}-{Model}-{id}.htm` and `/certified/LEXUS/...` (hybrids may use `/electric-certified/`).

The scraper honors HTTP 429 `Retry-After` and exponential backoff. It paginates, dedupes by VIN/stock, and **will not overwrite** `packs.json` with a partial collection. A 429 from this environment is not proof that GitHub Actions will succeed.

Local refresh:

```
npm install
npx playwright install --with-deps chromium
node scripts/scrape-inventory.mjs
```

If the public listing is blocked, a dealer-provided inventory export/feed (CSV/JSON of current used + CPO) is required; do not point the scraper at the old Nissan/Hyundai sites.

## Package
```
bash scripts/build-zip.sh
```
Writes `dist/LotLinker.zip` (use this on Windows), plus `dist/lot-linker-fill-2.5.0.zip` and `dist/lot-linker-fill.zip`. Unzip and Load unpacked on the `lot-linker-fill` folder inside.

## Tests
```
npm test
npm run test:fixtures
```

## Version
2.5.0

One-click Fill **first** sets **Vehicle type** to **Car/Truck** (Year/Make/etc. will not take until this is set), then writes **Year**, **Make**, **Price**, **Mileage**, **Body style**, **Exterior color**, **Interior color**, **Fuel type**, **Model** title line, **Description**, and **photos**. **VIN is never written**. Clean title and vehicle condition are never written. Description fill still walks Facebook’s vehicle-create markup. Comboboxes open then click a matching `[role=option]`. Price and Mileage use digits only.
