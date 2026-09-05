# Lot Linker Fill

Chrome MV3 extension for Lake Country Nissan / Hyundai. Pick a stock number and fill **only** the Facebook Marketplace title and description. You always hit Post.

**Repo:** https://github.com/Jedv9/lot-linker-fill

## Install
1. Clone or download this folder
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder (`manifest.json`)

## Use
1. Open Facebook Marketplace → create listing
2. Open the extension, search by stock / VIN / model
3. Click **Fill title + description**
4. You click Post

Title and description are generated at fill time from pack fields (`year`, `make`, `model`, `trim`, `price`, `mileage`, `stock`, `rooftop`, `bodyStyle`, `drivetrain`, `engine` if present, plus verified features from `features` / `equipment` / pack `body` standouts). Nothing else is filled. Photos stay manual.

## Title
`{Year} {Make} {Model} {Trim} | {engine or drivetrain or body} | ${price} | Oconomowoc WI`

## Description
Multi-line Wisconsin shopper copy: vehicle type, Boucher Lake Country Nissan or Hyundai, price, mileage, stock, up to 4 **buyer-facing** verified equipment bullets (heated seats, CarPlay, moonroof, BSM, tow, AWD/4WD, etc. — never baseline fluff like gasoline, ABS, or automatic transmission), then the standard availability / disclaimer block.

## Packs
Bundled `packs.json` loads on open. **Refresh packs** pulls the latest `packs.json` from this repo (optional `chrome.storage` override).

## Version
2.0.0
