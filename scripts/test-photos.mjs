import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { toPack } from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const photos = require("../photos.js");
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));
const vdpHtml = readFileSync(new URL("./vdp-photo-fixture.html", import.meta.url), "utf8");

const extracted = photos.extractPhotoUrls(vdpHtml);
assert.ok(extracted.length >= 3, `expected 3+ photo URLs, got ${extracted.length}: ${extracted}`);
assert.ok(extracted.every((u) => !/thumbnails/i.test(u)), "thumbnails must be skipped");
assert.ok(extracted.every((u) => photos.looksLikePhotoUrl(u)));
assert.ok(extracted.some((u) => /vehicle-images\.carscommerce\.inc/.test(u)));
assert.ok(extracted.some((u) => /pictures\.dealer\.com/.test(u)));
assert.ok(extracted.some((u) => /lexusofbrookfieldwi/.test(u)));
assert.ok(!extracted.some((u) => /boucher\.com\/icons/.test(u)));

const pack = toPack(cpo);
assert.ok(photos.hasPhotoSource(pack));
const fromPack = await photos.resolvePhotoUrls(pack, {
  fetchFn: async () => ({ ok: false }),
});
assert.equal(fromPack.source, "pack");
assert.ok(fromPack.urls.length >= 1);
assert.ok(fromPack.urls.every((u) => /pictures\.dealer\.com/.test(u)));

const fromVdp = await photos.resolvePhotoUrls(
  { stock: "X", vdpUrl: "https://www.lexusofbrookfield.com/certified/LEXUS/x.htm", photoUrls: pack.photoUrls },
  { fetchFn: async () => ({ ok: true, text: async () => vdpHtml }) }
);
assert.equal(fromVdp.source, "vdp");
assert.ok(fromVdp.urls.length >= fromPack.urls.length);

const none = await photos.resolvePhotoUrls({ stock: "NOPE" });
assert.deepEqual(none.urls, []);
assert.equal(photos.hasPhotoSource({}), false);

assert.ok(photos.hasPhotoSource({ vdpUrl: "https://www.lexusofbrookfield.com/used/Lexus/x.htm" }));

console.log(`photos extract ${extracted.length} · pack ${fromPack.urls.length} · vdp ${fromVdp.urls.length}`);
console.log("ok");
