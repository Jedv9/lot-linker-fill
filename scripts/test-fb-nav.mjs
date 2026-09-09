import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const nav = require("../fb-nav.js");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content-fb.js", import.meta.url), "utf8");

const CREATE = "https://www.facebook.com/marketplace/create/vehicle";

assert.equal(nav.createVehicleListingUrl(), CREATE);
assert.equal(nav.CREATE_VEHICLE_URL, CREATE);
assert.ok(!/facebook\.com\/?$/.test(nav.createVehicleListingUrl().replace(/\/$/, "")));
assert.equal(nav.isFacebookHomeUrl(CREATE), false);
assert.equal(nav.isSafeFillDestination(CREATE), true);
assert.equal(nav.isCreateVehicleListingUrl(CREATE), true);
assert.equal(nav.isCreateVehicleListingUrl(`${CREATE}/`), true);
assert.equal(nav.isCreateVehicleListingUrl(`${CREATE}?locale=en_US`), true);
assert.equal(nav.isCreateVehicleListingUrl("https://www.facebook.com/marketplace/create?category=vehicle"), true);
assert.equal(nav.isCreateVehicleListingUrl("https://www.facebook.com/marketplace/create/item"), false);

const homes = [
  "https://www.facebook.com/",
  "https://www.facebook.com",
  "https://facebook.com/",
  "https://www.facebook.com/home.php",
  "https://www.facebook.com/watch",
  "https://www.facebook.com/reels",
  "https://www.facebook.com/?sk=h_chr",
];
for (const url of homes) {
  assert.equal(nav.isFacebookHomeUrl(url), true, url);
  assert.equal(nav.isForbiddenNavigationUrl(url), true, url);
  assert.equal(nav.isSafeFillDestination(url), false, url);
  assert.equal(nav.needsCreateVehicleNavigation(url), true, url);
  const target = nav.navigationTarget(url);
  assert.equal(target.action, "navigate", url);
  assert.equal(target.url, CREATE, `must not bounce home from ${url}`);
  assert.equal(nav.isFacebookHomeUrl(target.url), false, url);
}

assert.equal(nav.isMarketplaceBrowseUrl("https://www.facebook.com/marketplace"), true);
assert.equal(nav.isMarketplaceBrowseUrl("https://www.facebook.com/marketplace/category/vehicles"), true);
assert.equal(nav.navigationTarget("https://www.facebook.com/marketplace").url, CREATE);
assert.equal(nav.navigationTarget("https://www.facebook.com/marketplace/create").url, CREATE);
assert.deepEqual(nav.navigationTarget(CREATE), { action: "stay", url: CREATE });
assert.equal(nav.needsCreateVehicleNavigation(CREATE), false);

assert.equal(nav.hrefLooksLikeHome("/"), true);
assert.equal(nav.hrefLooksLikeHome("https://www.facebook.com/"), true);
assert.equal(nav.hrefLooksLikeHome(CREATE), false);
assert.equal(nav.hrefLooksLikeHome("#"), false);

assert.throws(() => nav.assertSafeDestination("https://www.facebook.com/"));
assert.equal(nav.assertSafeDestination(CREATE), CREATE);

assert.match(background, /LOT_LINKER_FILL_TAB/);
assert.match(background, /Refusing to navigate to Facebook home/);
assert.match(background, /isSafeFillDestination/);
assert.doesNotMatch(background, /tabs\.update\([^)]*["']https:\/\/www\.facebook\.com\/["']/);
assert.doesNotMatch(background, /tabs\.create\([^)]*["']https:\/\/www\.facebook\.com\/["']/);
assert.match(popup, /LOT_LINKER_FILL_TAB/);
assert.match(content, /needNavigate/);
assert.match(content, /createVehicleUrl/);

console.log("fb-nav open-create guard ok · never home · create/vehicle only");
