import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const photos = require("../photos.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;
const vdpHtml = readFileSync(new URL("./vdp-photo-fixture.html", import.meta.url), "utf8");

const extracted = photos.extractPhotoUrls(vdpHtml);
assert.ok(extracted.length >= 3, `expected 3+ photo URLs, got ${extracted.length}: ${extracted}`);
assert.ok(extracted.every((u) => !/thumbnails/i.test(u)), "thumbnails must be skipped");
assert.ok(extracted.every((u) => photos.looksLikePhotoUrl(u)));
assert.ok(extracted.some((u) => /vehicle-images\.carscommerce\.inc/.test(u)));
assert.ok(extracted.some((u) => /pictures\.dealer\.com/.test(u)));
assert.ok(!extracted.some((u) => /boucher\.com\/icons/.test(u)));

const nissan = packs.find((p) => p.stock === "26NU0143");
assert.ok(photos.hasPhotoSource(nissan));
const fromPack = await photos.resolvePhotoUrls(nissan, {
  fetchFn: async () => ({ ok: false }),
});
assert.equal(fromPack.source, "pack");
assert.ok(fromPack.urls.length >= 1);
assert.ok(fromPack.urls.every((u) => /vehicle-images\.carscommerce\.inc/.test(u)));

const fromVdp = await photos.resolvePhotoUrls(
  { stock: "X", vdpUrl: "https://www.nissanlakecountry.com/inventory/x", photoUrls: nissan.photoUrls },
  { fetchFn: async () => ({ ok: true, text: async () => vdpHtml }) }
);
assert.equal(fromVdp.source, "vdp");
assert.ok(fromVdp.urls.length >= fromPack.urls.length);

const none = await photos.resolvePhotoUrls({ stock: "NOPE" });
assert.deepEqual(none.urls, []);
assert.equal(photos.hasPhotoSource({}), false);

const thin = packs.filter((p) => !p.photoUrls?.length && p.vdpUrl);
assert.ok(thin.length > 0, "VDP-only packs must still be a photo source");
assert.ok(thin.every((p) => photos.hasPhotoSource(p)));

console.log(`photos extract ${extracted.length} · pack ${fromPack.urls.length} · vdp ${fromVdp.urls.length}`);
console.log("ok");
