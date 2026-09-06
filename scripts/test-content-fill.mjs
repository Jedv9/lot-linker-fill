import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const packs = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8")).packs;
const content = readFileSync(new URL("../content-fb.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

assert.equal(manifest.version, "2.1.2");
assert.deepEqual(manifest.content_scripts[0].js, ["listing-copy.js", "content-fb.js"]);
assert.ok(!manifest.background, "service worker / photo download must be gone");
assert.ok(!manifest.permissions.includes("downloads"));

assert.match(content, /LOT_LINKER_FILL/);
assert.match(content, /Model \+ description only/);
assert.match(content, /\\bmodel\\b/);
assert.match(content, /\\bdescription\\b/);
assert.match(content, /_valueTracker/);
assert.match(content, /insertFromPaste|insertText/);
assert.match(content, /<br>/);
assert.doesNotMatch(content, /downloadPhotos|photo inject|openAndPick|mileageForFacebook/);
assert.match(content, /isProtectedLabel/);
assert.match(content, /mark\(\s*"model"/);
assert.match(content, /mark\(\s*"description"/);

assert.doesNotMatch(popup, /downloadPhotos|copyTitle|copyBody|importPaste/);
assert.doesNotMatch(popupHtml, /Download photos|Copy title|Import ALL-EASY-PASTE/);
assert.match(popupHtml, /Fill model \+ description/);
assert.match(popupHtml, /id="mPick"/);
assert.match(popup, /LOT_LINKER_FILL/);
assert.match(popup, /res\.missed/);
assert.match(popup, /pickerLabel|packPickerLabel/);
assert.doesNotMatch(popup, /storeShort/);

const nissan = listing.fromPack(packs.find((p) => p.stock === "26NU0143"));
assert.ok(nissan.body.includes("\n\n"), "description must keep blank lines");
assert.equal(nissan.body.split("\n\n").length >= 5, true);
assert.equal(nissan.modelLine, "Altima 2.5 SR | AWD | $30,470 | Oconomowoc WI");

const raptor = listing.packToListing(packs.find((p) => p.stock === "PU1392"));
assert.equal(raptor.modelLine, "F-150 SVT Raptor | 4WD | $26,900 | Oconomowoc WI");

console.log("content/popup/manifest checks ok");
