# Lot Linker Fill

Chrome MV3 extension for Lake Country Nissan / Hyundai. Pick a stock number and **Fill** Facebook Marketplace vehicle **Year**, **Make**, **Price**, **Model**, **Description**, and **photos** in one click. You always hit Post. VIN is never touched.

**Repo:** https://github.com/Jedv9/lot-linker-fill

## Install
1. Clone this folder, or unzip `dist/lot-linker-fill.zip` from `bash scripts/build-zip.sh`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder (`manifest.json`)

## Use
1. Open Facebook Marketplace → create **vehicle** listing (`/marketplace/create/vehicle` or equivalent)
2. Open the extension, search by stock / VIN / model — each row shows mileage and price
3. Click **Fill** (one click: Year + Make + Price + Model + description + photos)
4. You click Post — the extension never publishes

Jed should not download photos separately. **Save photos (fallback)** is only if Marketplace’s picker misses (Facebook UI change / no file input).

Model line and description are generated at fill time from pack fields (`year`, `make`, `model`, `trim`, `price`, `mileage`, `stock`, `rooftop`, `bodyStyle`, `drivetrain`, `engine` if present, plus verified features from `features` / `equipment` / pack `body` standouts). **Year**, **Make**, and **Price** are written into their own Marketplace fields. VIN is never filled. Mileage is left alone.

## Model line (Facebook vehicle create)
`{Model} {Trim} | {engine or drivetrain or body} | ${price} | Oconomowoc WI`

Example: `F-150 SVT Raptor | 4WD | $26,900 | Oconomowoc WI` — no year, no make in this string. Year and Make are filled in their own dropdowns. Price field gets digits only (`26900`), not `$26,900`.

## Title
Still built as `{Year} {Make} {Model} {Trim} | {engine or drivetrain or body} | ${price} | Oconomowoc WI` for preview / other use. Vehicle listings do not have a Title field.

## Description
Multi-line Wisconsin shopper copy: vehicle type, Boucher Lake Country Nissan or Hyundai, price, mileage, stock, up to **5** Key equipment bullets in Jed’s locked order (heated seats → CarPlay/Android Auto → camera/BSM/sensors → power seats → AWD/4WD, then leather / premium audio / moonroof / adaptive cruise / remote start / power liftgate). Never invent; never baseline fluff.

If a stock has fewer than 5 verified hits, the popup researches that vehicle’s VDP (`vdpUrl`) and NHTSA VIN decode (AWD/4WD only), 10s timeout, then falls back to pack features.

## Photos
Fill fetches unit photos from pack `photoUrls` and/or the VDP page (`vehicle-images.carscommerce.inc` and a few dealer CDNs), strips the Boucher red banner (same crop as v1.6), and assigns `File` objects onto Marketplace’s `<input type="file" multiple>` (or dropzone). Status reports `filled model · description · N photos` or `missed: photos` with a reason.

The service worker does the fetch + strip so Facebook is not sent as `Referer`. Host permissions cover dealer VDPs and photo CDNs. The content script waits/retries for the photo picker (slow create-page loads) and never clicks Post / Publish / Next.

Facebook caveats: the picker is often a hidden file input behind “Add photos”. Marketplace may cap how many images stick; extras are dropped by FB, not posted. If the composer has not reached the vehicle photo step, Fill reports a missed photo picker — stay on create/vehicle and retry.

## Packs
Bundled `packs.json` loads on open. **Refresh packs** pulls the latest `packs.json` from this repo (optional `chrome.storage` override).

## Package
```
bash scripts/build-zip.sh
```
Writes `dist/lot-linker-fill-2.2.2.zip` and `dist/lot-linker-fill.zip` (unpacked folder inside the zip).

## Version
2.2.2

One-click Fill writes **only** **Year** (combobox / `aria-label="Year"`), **Make** (combobox), **Price** (numeric input), **Model** title line, **Description**, and **photos**. **VIN is never written** — the VIN field is skipped at find and at write. Mileage, colors, trim, and body style are not filled. Description fill still walks Facebook’s vehicle-create markup: wrapper `[aria-label="Description"]`, nested `textarea` / `[role=textbox]` / `contenteditable`. Year/Make open `[role=combobox]` then click a matching `[role=option]`. Price uses `_valueTracker` + input/change on the Price field.
