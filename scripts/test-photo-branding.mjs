import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { photoUrls, toPack } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const photos = require("../photos.js");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");
const vdpHtml = readFileSync(new URL("./vdp-photo-fixture.html", import.meta.url), "utf8");
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));

const FAVICON =
  "https://pictures.dealer.com/l/lexusprogram/0991/5e2600a01524afb803de30925275cf48x.jpg";
const FLYER =
  "https://pictures.dealer.com/l/lexusofbrookfieldwi/1069/93a993986eb1971c0f310d12c7234d6fx.jpg";
const HERO =
  "https://pictures.dealer.com/l/lexusofbrookfieldwi/1154/76f9dc0c6aa01deb7b46b80db984bf05x.jpg";
const WHEEL =
  "https://pictures.dealer.com/l/lexusofbrookfieldwi/1219/18160865ab0711fb0f191cc56651b926x.jpg";

assert.equal(photos.isBrandingPhotoUrl(FAVICON), true);
assert.equal(photos.looksLikePhotoUrl(FAVICON), false);
assert.equal(photos.isBrandingPhotoUrl(FLYER), true);
assert.equal(photos.looksLikePhotoUrl(FLYER), false);
assert.equal(photos.looksLikePhotoUrl(HERO), true);
assert.equal(photos.isBrandingPhotoUrl(HERO), false);

const extracted = photos.extractPhotoUrls(vdpHtml);
assert.ok(!extracted.some((u) => /lexusprogram/i.test(u)), "VDP favicon / lexusprogram L must be skipped");
assert.ok(!extracted.some((u) => /93a993986eb1971c0f310d12c7234d6f/i.test(u)), "dealer promo collage must be skipped");
assert.ok(extracted.some((u) => /8ceca0b87c1eb9c873abb974ed0c9558/i.test(u)), "real vehicle photo kept");
assert.notEqual(extracted[1], FAVICON, "must not skip by position: 2nd kept URL is not the L");

const packPhotos = photoUrls(cpo);
assert.ok(!packPhotos.includes(FLYER), "scrape photoUrls drops the lot-wide flyer");
assert.ok(packPhotos.length >= 4);
assert.deepEqual(toPack(cpo).photoUrls, packPhotos);

assert.deepEqual(
  photos.filterPhotoUrls([HERO, FAVICON, WHEEL, FLYER]),
  [HERO, WHEEL],
  "keep real photos in order; drop branding anywhere"
);

const lot = [];
for (let i = 0; i < 10; i++) {
  const a = `a${String(i).padStart(31, "0")}`;
  const b = `b${String(i).padStart(31, "0")}`;
  lot.push({
    stock: `S${i}`,
    photoUrls: [
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0001/${a}x.jpg`,
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0002/${b}x.jpg`,
      FLYER,
    ],
  });
}
const cleaned = photos.dropRepeatedPhotos(lot, 8);
for (const p of cleaned) {
  assert.equal(p.photoUrls.length, 2, `${p.stock} should keep two unique vehicle photos`);
  assert.ok(!p.photoUrls.includes(FLYER));
  assert.match(p.photoUrls[0], /\/0001\//);
  assert.match(p.photoUrls[1], /\/0002\//);
}

const sharedHero = [];
for (let i = 0; i < 9; i++) {
  const extra = `c${String(i).padStart(31, "0")}`;
  sharedHero.push({
    stock: `R${i}`,
    photoUrls: [
      HERO,
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0003/${extra}x.jpg`,
    ],
  });
}
const afterRepeat = photos.dropRepeatedPhotos(sharedHero, 8);
for (const p of afterRepeat) {
  assert.ok(!p.photoUrls.includes(HERO), "identical URL on 9 vehicles is treated as branding");
  assert.equal(p.photoUrls.length, 1);
  assert.match(p.photoUrls[0], /\/0003\//);
}

assert.equal(await photos.isTinyBrandingBlob({ size: 568 }), true);
assert.equal(await photos.isTinyBrandingBlob({ size: 50000 }), false);

const resolved = await photos.resolvePhotoUrls(
  {
    stock: "PER3178",
    vdpUrl: "https://www.lexusofbrookfield.com/certified/LEXUS/es.htm",
    photoUrls: [HERO, FAVICON, WHEEL, FLYER],
  },
  { fetchFn: async () => ({ ok: true, text: async () => vdpHtml }) }
);
assert.ok(!resolved.urls.some((u) => /lexusprogram|93a993986eb1971c0f310d12c7234d6f/i.test(u)));
assert.ok(resolved.urls.some((u) => /76f9dc0c6aa01deb7b46b80db984bf05|8ceca0b87c1eb9c873abb974ed0c9558/.test(u)));

assert.match(popup, /dropRepeatedPhotos|stripBrandingPhotos/);
assert.match(popup, /normalizePacks\(overlay\.packs\)/);
assert.match(scraper, /dropRepeatedPhotos/);

console.log("photo branding ok · skipped lexusprogram favicon + lot-wide flyer · unique photos kept in order");
