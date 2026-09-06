# Lot Linker Fill

Chrome MV3 extension for Lake Country Nissan / Hyundai. Pick a stock number and fill **only** the Facebook Marketplace vehicle **Model** field and **Description**. You always hit Post. Year, Make, and Mileage are left alone.

**Repo:** https://github.com/Jedv9/lot-linker-fill

## Install
1. Clone or download this folder
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder (`manifest.json`)

## Use
1. Open Facebook Marketplace → create listing
2. Open the extension, search by stock / VIN / model — each row shows mileage and price
3. Click **Fill model + description**
4. You click Post

Model line and description are generated at fill time from pack fields (`year`, `make`, `model`, `trim`, `price`, `mileage`, `stock`, `rooftop`, `bodyStyle`, `drivetrain`, `engine` if present, plus verified features from `features` / `equipment` / pack `body` standouts). Nothing else is filled. Photos stay manual.

## Model line (Facebook vehicle create)
`{Model} {Trim} | {engine or drivetrain or body} | ${price} | Oconomowoc WI`

Example: `F-150 SVT Raptor | 4WD | $26,900 | Oconomowoc WI` — no year, no make. Facebook already has Year and Make dropdowns.

## Title
Still built as `{Year} {Make} {Model} {Trim} | {engine or drivetrain or body} | ${price} | Oconomowoc WI` for preview / other use. Vehicle listings do not have a Title field.

## Description
Multi-line Wisconsin shopper copy: vehicle type, Boucher Lake Country Nissan or Hyundai, price, mileage, stock, up to **5** Key equipment bullets in Jed’s locked order (heated seats → CarPlay/Android Auto → camera/BSM/sensors → power seats → AWD/4WD, then leather / premium audio / moonroof / adaptive cruise / remote start / power liftgate). Never invent; never baseline fluff.

If a stock has fewer than 5 verified hits, the popup researches that vehicle’s VDP (`vdpUrl`) and NHTSA VIN decode (AWD/4WD only), 10s timeout, then falls back to pack features.

## Packs
Bundled `packs.json` loads on open. **Refresh packs** pulls the latest `packs.json` from this repo (optional `chrome.storage` override).

## Version
2.1.3

Description fill walks Facebook’s real vehicle-create markup: wrapper `[aria-label="Description"]`, nested `textarea` / `[role=textbox]` / `contenteditable`, nearby “Tell buyers about your vehicle” copy, then a lone textarea fallback. Scrolls the field into view and retries once if the first pass misses.
