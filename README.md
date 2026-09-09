# Lot Linker Fill

Chrome MV3 extension for Lake Country Nissan / Hyundai. Pick a stock number and **Fill** Facebook Marketplace vehicle **Vehicle type** (Car/Truck), **Year**, **Make**, **Price**, **Model**, **Mileage**, **Body style**, **Exterior color**, **Interior color**, **Fuel type**, **Description**, and **photos** in one click. If you are not already on the create-vehicle form, Fill opens `https://www.facebook.com/marketplace/create/vehicle` in the Facebook tab (never facebook.com home) and waits for the form. You always hit Post. The popup picker tracks **Posted / Not posted** per stock so you can see what is left. VIN, clean title, and vehicle condition are never touched.

**Repo:** https://github.com/Jedv9/lot-linker-fill

## Install
1. Clone this folder, or unzip `dist/lot-linker-fill.zip` from `bash scripts/build-zip.sh`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder (`manifest.json`)

## Use
1. You can start on any facebook.com tab — **Fill** opens Marketplace create **vehicle** listing (`/marketplace/create/vehicle`) if you are not already there
2. Open the extension, search by stock / VIN / model — each row shows mileage, price, and Posted / Not posted
3. The picker defaults to **Not posted** and shows a **N left** count. Switch the filter to Posted or All when you need them. Search and store filters still apply.
4. Click **Posted / Not posted** on a row (or **Mark posted**) to record that you listed it. Unmark if you tapped the wrong stock. Marks are stored by stock number and survive popup close, browser restart, and **Refresh packs**.
5. Click **Fill** (opens create/vehicle if needed, Vehicle type Car/Truck first — must succeed before other fields — then Year, Make, Price, Model, Mileage, body, colors, fuel, description, photos)
6. You click Post — the extension never publishes, never clicks Buy / Offer, and never sends messages. If it can reliably see that the listing went live after you posted, it marks that stock posted. If that guess is wrong, the manual mark wins.

Jed should not download photos separately. **Save photos (fallback)** is only if Marketplace’s picker misses (Facebook UI change / no file input).

Model line and description are generated at fill time from pack fields (`year`, `make`, `model`, `trim`, `price`, `mileage`, `stock`, `rooftop`, `bodyStyle`, `drivetrain`, `engine` if present, plus verified features from `features` / `equipment` / pack `body` standouts). **Year**, **Make**, **Price**, **Mileage**, **Body style**, **Exterior color**, **Interior color**, and **Fuel type** are written into their own Marketplace fields when the pack has a value we can map. Mileage is never written below **300** (Facebook’s vehicle minimum); 0, blank, or any lower pack value fills as 300. VIN is never filled. The clean-title checkbox and vehicle condition are left alone.

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

The service worker does the fetch + strip so Facebook is not sent as `Referer`. Host permissions cover dealer VDPs and photo CDNs. The content script waits/retries for the photo picker (slow create-page loads) and never clicks Post / Publish / Next / Buy / Offer.

Facebook caveats: the picker is often a hidden file input behind “Add photos”. Marketplace may cap how many images stick; extras are dropped by FB, not posted. If the composer has not reached the vehicle photo step, Fill reports a missed photo picker — stay on create/vehicle and retry.

## Packs
Bundled `packs.json` loads on open. **Refresh packs** pulls the latest `packs.json` from this repo (optional `chrome.storage` override). Posted marks live in a separate `chrome.storage` map keyed by stock — Refresh does not wipe them.

## Package
```
bash scripts/build-zip.sh
```
Writes `dist/lot-linker-fill-2.3.3.zip` and `dist/lot-linker-fill.zip` (unpacked folder inside the zip).

## Reload after update
Chrome → `chrome://extensions` → Lot Linker Fill → Reload. If you load from the zip, unzip then Load unpacked on that folder (same as before).

## Version
2.3.3

One-click Fill opens `/marketplace/create/vehicle` when Jed is not already on that form (never `facebook.com/` home, never Marketplace browse). It **first** sets **Vehicle type** to **Car/Truck** (or Car vs Truck from the pack if Facebook split the control). Other fields are gated until that succeeds. Then it writes **Year**, **Make**, **Price**, **Model** title line, **Mileage**, **Body style**, **Exterior color**, **Interior color**, **Fuel type**, **Description**, and **photos**. **VIN is never written**. Clean title and vehicle condition are never written. Fill never sends Escape to the page (that closed Facebook’s create dialog and bounced home). Description fill still walks Facebook’s vehicle-create markup. Year / Body style / Exterior / Interior are found by nearby label text (not only `aria-label`) so a grouped “Year, make, model…” wrapper does not skip them. Comboboxes open, type-to-filter when the list is long, then click a matching `[role=option]`. Price and Mileage use digits only. Mileage is clamped to a **300**-mile Facebook minimum (0 / blank / under 300 → 300).
