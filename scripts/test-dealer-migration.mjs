import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DEALER,
  NEW_INVENTORY_PAGE,
  PREOWNED_SOURCES,
  extractEmbeddedInventory,
  extractInventoryApiUrl,
  extractJsonLdVehicles,
  isCertified,
  isCurrentDealerPack,
  isListable,
  isNewVehicle,
  pickPrice,
  photoUrls,
  rejectOldDealerPacks,
  toPack,
  vdpUrl,
} from "./dealer-inventory.mjs";

const require = createRequire(import.meta.url);
const listing = require("../listing-copy.js");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const scraper = readFileSync(new URL("./scrape-inventory.mjs", import.meta.url), "utf8");
const dealerMod = readFileSync(new URL("./dealer-inventory.mjs", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const packsDoc = JSON.parse(readFileSync(new URL("../packs.json", import.meta.url), "utf8"));
const cpo = JSON.parse(readFileSync(new URL("./fixtures/cpo-vehicle.json", import.meta.url), "utf8"));
const cpoHybrid = JSON.parse(readFileSync(new URL("./fixtures/cpo-hybrid-vehicle.json", import.meta.url), "utf8"));
const neu = JSON.parse(readFileSync(new URL("./fixtures/new-vehicle.json", import.meta.url), "utf8"));
const genesis = JSON.parse(readFileSync(new URL("./fixtures/used-genesis-vehicle.json", import.meta.url), "utf8"));

assert.equal(DEALER.name, "Lexus of Brookfield");
assert.equal(DEALER.site, "https://www.lexusofbrookfield.com");
assert.equal(DEALER.address, "20001 W Bluemound Rd");
assert.equal(DEALER.city, "Brookfield");
assert.equal(DEALER.zip, "53045");
assert.equal(DEALER.phone, "262-320-4619");
assert.equal(listing.STORE, "Lexus of Brookfield");
assert.equal(listing.CITY, "Brookfield");
assert.equal(listing.CITY_TITLE, "Brookfield WI");
assert.equal(listing.storeName({ make: "Nissan", rooftop: "Lake Country Nissan" }), "Lexus of Brookfield");

assert.ok(PREOWNED_SOURCES.some((s) => /used-inventory/.test(s.page)));
assert.ok(PREOWNED_SOURCES.some((s) => /l-certified-inventory/.test(s.page)));
assert.match(NEW_INVENTORY_PAGE, /new-inventory/);

assert.equal(isNewVehicle(neu), true);
assert.equal(isListable(neu), false);
assert.match(vdpUrl(neu), /\/electric-new\//);
assert.equal(isNewVehicle(cpo), false);
assert.equal(isCertified(cpo), true);
assert.equal(isListable(cpo), true);
assert.equal(pickPrice(cpo), 43999);
assert.ok(photoUrls(cpo).length >= 4);
assert.match(vdpUrl(cpo), /^https:\/\/www\.lexusofbrookfield\.com\/certified\/LEXUS\/2024-LEXUS-NX-/);

assert.equal(isNewVehicle(cpoHybrid), false);
assert.equal(isCertified(cpoHybrid), true);
assert.match(vdpUrl(cpoHybrid), /\/electric-certified\//);

assert.equal(isNewVehicle(genesis), false);
assert.equal(isCertified(genesis), false);
assert.match(vdpUrl(genesis), /\/used\/Genesis\//);
assert.equal(genesis.make, "Genesis");
assert.equal(genesis.stockNumber, "28159A");
assert.equal(genesis.vin, "KMUHCESC6RU160210");

const hondaUsed = {
  ...cpo,
  make: "Honda",
  model: "Civic",
  trim: "EX-L",
  certified: false,
  condition: "Used",
  type: "used",
  stockNumber: "PRH2577A",
  vin: "2HGFG3B0XFH530955",
  link: "/used/Honda/2015-Honda-Civic-b853da2dac1837348d2b5601302a58c7.htm",
};
assert.equal(isNewVehicle(hondaUsed), false);
assert.equal(isCertified(hondaUsed), false);
assert.equal(isListable(hondaUsed), true);
assert.match(vdpUrl(hondaUsed), /\/used\/Honda\//);

const cpoPack = toPack(cpo);
assert.equal(cpoPack.stock, "PMT3253");
assert.equal(cpoPack.year, "2024");
assert.equal(cpoPack.make, "Lexus");
assert.equal(cpoPack.model, "NX");
assert.equal(cpoPack.trim, "350 Premium");
assert.equal(cpoPack.price, "43999");
assert.equal(cpoPack.mileage, "17009");
assert.equal(cpoPack.certified, true);
assert.notEqual(cpoPack.condition, "NEW");
assert.equal(cpoPack.rooftop, "Lexus of Brookfield");
assert.equal(cpoPack.zip, "53045");
assert.equal(cpoPack.drivetrain, "AWD");
assert.equal(cpoPack.exterior, "Caviar");
assert.equal(cpoPack.interior, "Hazel");
assert.doesNotMatch(cpoPack.vdpUrl, /nissanlakecountry|hyundailakecountry|boucher/);
assert.ok(listing.isCurrentDealerPack(cpoPack));
assert.equal(
  listing.pickerLabel(cpoPack),
  "PMT3253 · 2024 Lexus NX 350 Premium · 17,009 mi · $43,999"
);
assert.equal(listing.buildModelLine(cpoPack), "NX 350 Premium | AWD | $43,999 | Brookfield WI");
assert.doesNotMatch(listing.buildModelLine(cpoPack), /2024|Lexus/);
assert.match(listing.buildDescription(cpoPack), /Lexus of Brookfield in Brookfield, Wisconsin/);
assert.match(listing.buildDescription(cpoPack), /L\/Certified Pre-Owned/);
assert.doesNotMatch(listing.buildDescription(cpoPack), /Boucher|Lake Country|Oconomowoc|Nissan of|Hyundai of/);
assertLayout(listing.buildDescription(cpoPack));

const genesisPack = toPack(genesis);
assert.equal(genesisPack.make, "Genesis");
assert.equal(genesisPack.model, "GV80");
assert.equal(genesisPack.stock, "28159A");
assert.equal(genesisPack.certified, false);
assert.equal(genesisPack.rooftop, "Lexus of Brookfield");
assert.match(genesisPack.vdpUrl, /\/used\/Genesis\/2024-Genesis-GV80-/);
assert.doesNotMatch(listing.buildDescription(genesisPack), /L\/Certified Pre-Owned/);
assert.match(listing.buildDescription(genesisPack), /2024 Genesis GV80 is available at Lexus of Brookfield in Brookfield/);

const newPack = toPack(neu);
assert.equal(isListable(neu), false);
assert.match(newPack.vdpUrl, /\/electric-new\//);

assert.equal(
  listing.isCurrentDealerPack({
    rooftop: "Lake Country Nissan",
    vdpUrl: "https://www.nissanlakecountry.com/inventory/x",
  }),
  false
);
assert.equal(
  listing.isCurrentDealerPack({
    rooftop: "Lexus of Brookfield",
    vdpUrl: "https://www.lexusofbrookfield.com/used/Lexus/x.htm",
  }),
  true
);
assert.deepEqual(
  rejectOldDealerPacks([
    cpoPack,
    { stock: "26NU0143", rooftop: "Lake Country Nissan", vdpUrl: "https://www.nissanlakecountry.com/x" },
  ]).map((p) => p.stock),
  ["PMT3253"]
);

assert.equal(manifest.version, "2.3.0");
assert.ok(manifest.host_permissions.some((h) => /lexusofbrookfield\.com/.test(h)));
assert.ok(manifest.host_permissions.some((h) => /pictures\.dealer\.com/.test(h)));
assert.ok(!manifest.host_permissions.some((h) => /nissanlakecountry|hyundailakecountry|boucher\.com/.test(h)));

assert.match(scraper, /lexusofbrookfield\.com|PREOWNED_SOURCES/);
assert.match(dealerMod, /used-inventory/);
assert.match(dealerMod, /l-certified-inventory/);
assert.match(scraper, /isNewVehicle/);
assert.match(scraper, /Retry-After/);
assert.match(scraper, /shouldWritePacks/);
assert.match(scraper, /dedupeVehicles/);
assert.doesNotMatch(scraper, /www\.nissanlakecountry|www\.hyundailakecountry/);
assert.doesNotMatch(dealerMod, /www\.nissanlakecountry|www\.hyundailakecountry/);
assert.match(popup, /currentDealerPacks/);
assert.match(readme, /Lexus of Brookfield/);
assert.match(readme, /used-inventory\/index\.htm/);
assert.doesNotMatch(readme, /Oconomowoc WI|Boucher Lake Country/);

assert.ok(Array.isArray(packsDoc.packs));
assert.ok(packsDoc.packs.length >= 10, `expected bundled pre-owned inventory, got ${packsDoc.packs.length}`);
assert.match(String(packsDoc.source || ""), /lexusofbrookfield|PRE-OWNED/i);
assert.equal(packsDoc.dealer, "Lexus of Brookfield");

const makes = new Set(packsDoc.packs.map((p) => p.make));
for (const p of packsDoc.packs) {
  assert.ok(listing.isCurrentDealerPack(p), `old dealer pack leaked: ${p.stock} ${p.rooftop} ${p.vdpUrl}`);
  assert.notEqual(String(p.condition).toUpperCase(), "NEW", `new inventory leaked: ${p.stock}`);
  assert.doesNotMatch(p.vdpUrl || "", /\/new\/|\/electric-new\//);
  assert.doesNotMatch(p.vdpUrl || "", /nissanlakecountry|hyundailakecountry/);
  assert.match(p.vdpUrl || "", /lexusofbrookfield\.com/);
  assert.ok(Number(p.price) > 0, `missing price ${p.stock}`);
  if (p.certified || /cpo|certified/i.test(p.condition)) {
    assert.match(listing.buildDescription(p), /L\/Certified Pre-Owned/);
  }
}
assert.ok(
  packsDoc.packs.some((p) => p.certified || /cpo|certified/i.test(p.condition)),
  "CPO units must be in pre-owned packs"
);
if (packsDoc.complete) {
  assert.ok(Number(packsDoc.expectedTotal) > 0);
  assert.ok(packsDoc.packs.length >= packsDoc.expectedTotal, `complete bundle ${packsDoc.packs.length} < ${packsDoc.expectedTotal}`);
  assert.ok(makes.size >= 10, `complete bundle must include other makes, got ${[...makes].join(",")}`);
  assert.ok(packsDoc.packs.some((p) => !/^lexus$/i.test(p.make)), "complete bundle is not Lexus-only");
}

const generic = listing.fromPack({
  stock: "PU1392",
  year: "2012",
  make: "Ford",
  model: "F-150",
  trim: "SVT Raptor",
  bodyStyle: "Crew Cab 4D",
  mileage: "87000",
  condition: "USED",
  drivetrain: "4WD",
  price: "26900",
  rooftop: "Lexus of Brookfield",
  vdpUrl: "https://www.lexusofbrookfield.com/used/Ford/2012-Ford-F-150.htm",
  features: ["Heated Seats", "Backup Camera", "4WD"],
});
assert.equal(generic.modelLine, "F-150 SVT Raptor | 4WD | $26,900 | Brookfield WI");
assert.equal(listing.vehicleType({ bodyStyle: "Crew Cab 4D", model: "F-150" }), "truck");
assert.equal(listing.vehicleType({ bodyStyle: "Hatchback 4D", model: "Soul" }), "hatchback");

function assertLayout(body) {
  const lines = body.split("\n");
  assert.match(lines[0], /^Wisconsin shoppers looking for a \S+ under \$[\d,]+:$/);
  assert.equal(lines[1], "");
  assert.match(lines[2], / is available at Lexus of Brookfield in Brookfield, Wisconsin\.$/);
  assert.equal(lines[3], "");
  assert.match(lines[4], /^Price: \$[\d,]+$/);
  assert.match(lines[5], /^Mileage: /);
  assert.match(lines[6], /^Stock #: /);
}

const htmlSnippet = `"inventoryApiURL": "/apis/widget/SITEBUILDER_L_CERTIFIED_INVENTORY_1:inventory-data-bus1/getInventory","pageInfo":{"totalCount":31},"inventory":[{"inventoryButtons":[{"inventoryType":"used"}],"vin":"2T2GGCEZ9RC048310","stockNumber":"PMT3253","year":2024,"make":"LEXUS","model":"NX","trim":"350 Premium","type":"used","certified":true,"link":"/certified/LEXUS/x.htm","pricing":{"dprice":[{"typeClass":"askingPrice","value":"$43,999"}]},"images":[{"uri":"https://pictures.dealer.com/l/lexusofbrookfieldwi/1471/8ceca0b87c1eb9c873abb974ed0c9558x.jpg","provider":"ACTUAL_PHOTO"}]}]`;
assert.equal(
  extractInventoryApiUrl(htmlSnippet),
  "/apis/widget/SITEBUILDER_L_CERTIFIED_INVENTORY_1:inventory-data-bus1/getInventory"
);
const embedded = extractEmbeddedInventory(htmlSnippet);
assert.equal(embedded.length, 1);
assert.equal(embedded[0].stockNumber, "PMT3253");

const ldHtml = `<script type="application/ld+json">{"@type":"CollectionPage","about":{"offers":{"itemOffered":[{"@type":["Product","Car"],"name":"Certified Pre-Owned 2024 LEXUS NX 350 Premium","url":"https://www.lexusofbrookfield.com/certified/LEXUS/2024-LEXUS-NX-03985068ac1816bee9b0b4cfc2d870ea.htm","offers":{"price":"44516"},"vehicleIdentificationNumber":"2T2GGCEZ9RC048310","sku":"PMT3253","vehicleModelDate":2024,"brand":{"name":"LEXUS"},"model":"NX"}]}}}</script>`;
const ld = extractJsonLdVehicles(ldHtml);
assert.equal(ld.length, 1);
assert.equal(ld[0].stockNumber, "PMT3253");
assert.equal(isNewVehicle(ld[0]), false);
assert.equal(isCertified(ld[0]), true);

const ldNew = extractJsonLdVehicles(
  `<script type="application/ld+json">{"@type":"CollectionPage","about":{"offers":{"itemOffered":[{"name":"New 2026 LEXUS ES 500e Luxury","url":"https://www.lexusofbrookfield.com/electric-new/LEXUS/2026-LEXUS-ES-9252e11eac180486dccee4dfe3b5f3d7.htm","sku":"30336","brand":{"name":"LEXUS"},"model":"ES"}]}}}</script>`
);
assert.equal(isNewVehicle(ldNew[0]), true);
assert.equal(isListable(ldNew[0]), false);

console.log(
  `dealer migration ok · cpo ${cpoPack.stock} · genesis ${genesisPack.stock} · bundled ${packsDoc.packs.length} · makes ${[...makes].sort().join(",")}`
);
