import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const posted = require("../posted.js");

const packs = [
  { stock: "PU1392" },
  { stock: "26NU0143" },
  { stock: "26NU0156" },
];

assert.equal(posted.stockKey("  PU1392  "), "PU1392");
assert.equal(posted.isPosted({}, "PU1392"), false);
assert.equal(posted.isPosted(null, "PU1392"), false);
assert.equal(posted.leftLabel(12), "12 left");
assert.equal(posted.leftLabel(0), "0 left");
assert.equal(posted.countNotPosted(packs, {}), 3);

let map = posted.markInMap({}, "PU1392", true, "2026-09-09T00:00:00.000Z");
assert.equal(posted.isPosted(map, "PU1392"), true);
assert.equal(posted.isPosted(map, "26NU0143"), false);
assert.equal(posted.countNotPosted(packs, map), 2);
assert.deepEqual(
  posted.applyPostedFilter(packs, map, "not").map((p) => p.stock),
  ["26NU0143", "26NU0156"]
);
assert.deepEqual(
  posted.applyPostedFilter(packs, map, "posted").map((p) => p.stock),
  ["PU1392"]
);
assert.equal(posted.applyPostedFilter(packs, map, "all").length, 3);

map = posted.markInMap(map, "PU1392", false);
assert.equal(posted.isPosted(map, "PU1392"), false);
assert.equal(posted.countNotPosted(packs, map), 3);

const refreshedPacks = [{ stock: "PU1392" }, { stock: "NEWSTOCK" }];
const kept = posted.markInMap({}, "PU1392", true, "2026-09-09T00:00:00.000Z");
assert.equal(posted.isPosted(kept, "PU1392"), true, "refresh must not wipe posted marks");
assert.equal(posted.isPosted(kept, "NEWSTOCK"), false);
assert.equal(posted.countNotPosted(refreshedPacks, kept), 1);

assert.equal(posted.looksLikePostSuccessUrl("https://www.facebook.com/marketplace/item/1234567890"), true);
assert.equal(posted.looksLikePostSuccessUrl("https://www.facebook.com/marketplace/create/vehicle"), false);
assert.equal(posted.looksLikePostSuccessUrl("https://www.facebook.com/marketplace/you/selling"), false);
assert.equal(posted.looksLikePostSuccessText("Your listing is now live."), true);
assert.equal(posted.looksLikePostSuccessText("Something went wrong"), false);

assert.equal(posted.isUserPublishClickLabel("Post"), true);
assert.equal(posted.isUserPublishClickLabel("Publish"), true);
assert.equal(posted.isUserPublishClickLabel("Next"), false);
assert.equal(posted.isUserPublishClickLabel("Buy"), false);
assert.equal(posted.isUserPublishClickLabel("Offer"), false);
assert.equal(posted.isUserPublishClickLabel("Make offer"), false);

assert.equal(posted.pendingStillLive({ stock: "PU1392", filledAt: Date.now() }), false);
assert.equal(
  posted.pendingStillLive({
    stock: "PU1392",
    filledAt: Date.now() - 1000,
    userClickedPostAt: Date.now() - 500,
  }),
  true
);
assert.equal(
  posted.pendingStillLive({
    stock: "PU1392",
    filledAt: Date.now() - 1000,
    userClickedPostAt: Date.now() - posted.POST_CLICK_TTL_MS - 10,
  }),
  false
);

const store = {
  postedByStock: {},
  pendingMarketplacePost: {
    stock: "PU1392",
    filledAt: Date.now() - 1000,
    userClickedPostAt: Date.now() - 200,
  },
};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        for (const k of keys) out[k] = store[k];
        cb(out);
      },
      set(obj, cb) {
        Object.assign(store, obj);
        if (cb) cb();
      },
      remove(keys, cb) {
        for (const k of keys) delete store[k];
        if (cb) cb();
      },
    },
  },
};

const marked = await posted.maybeMarkPendingPosted({
  href: "https://www.facebook.com/marketplace/item/987654321",
  text: "",
});
assert.equal(marked, "PU1392");
assert.equal(posted.isPosted(store.postedByStock, "PU1392"), true);
assert.equal(store.pendingMarketplacePost, undefined);

store.pendingMarketplacePost = {
  stock: "26NU0143",
  filledAt: Date.now() - 1000,
};
const skipped = await posted.maybeMarkPendingPosted({
  href: "https://www.facebook.com/marketplace/item/1",
  text: "Your listing is now live.",
});
assert.equal(skipped, null, "no Post click → do not auto-mark");
assert.equal(posted.isPosted(store.postedByStock, "26NU0143"), false);

console.log("posted tracker helpers ok");
