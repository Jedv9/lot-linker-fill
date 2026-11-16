/**
 * Lot Linker Fill — read rendered Dealer.com inventory / VDP in the page.
 * Injected in the MAIN world so window.DDC / pricing XHR state is visible.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerDealerRead = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function snapshotDdc() {
    try {
      const w = typeof window !== "undefined" ? window : {};
      return w.DDC || w.DDCData || w.__inventory || w.PAGE || null;
    } catch {
      return null;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function challengeOf(doc) {
    const api = typeof LotLinkerVdpPrice !== "undefined" ? LotLinkerVdpPrice : null;
    if (!api?.detectChallenge) return "";
    const html = doc?.documentElement?.outerHTML || "";
    return api.detectChallenge(html, doc?.title || "");
  }

  function listingFromPage(doc) {
    const html = doc?.documentElement?.outerHTML || "";
    const inv = typeof LotLinkerInventory !== "undefined" ? LotLinkerInventory : null;
    const ddc = snapshotDdc();
    let vehicles = inv ? inv.vehiclesFromListingHtml(html) : [];
    if (!vehicles.length && ddc && inv) {
      vehicles = inv.vehiclesFromListingHtml(JSON.stringify(ddc));
    }
    let expectedTotal = inv ? inv.extractTotalCount(html) : 0;
    if (!expectedTotal && ddc && inv) {
      expectedTotal = inv.extractTotalCount(JSON.stringify(ddc));
    }
    return { vehicles, expectedTotal, html };
  }

  function vdpReady(doc) {
    if (!doc) return false;
    if (doc.querySelector(".price-summary__final-price-value, .price-summary__final-price-label, [data-total-sale-price]")) {
      return true;
    }
    const dts = doc.querySelectorAll("dt, th");
    for (const dt of dts) {
      if (/total sale price/i.test(dt.textContent || "")) return true;
    }
    const text = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    if (/Total Sale Price/i.test(text)) return true;
    const ddc = snapshotDdc();
    if (ddc && typeof LotLinkerVdpPrice !== "undefined" && LotLinkerVdpPrice.walkForDprice) {
      if (LotLinkerVdpPrice.walkForDprice(ddc, 0).length) return true;
    }
    return false;
  }

  function listingReady(doc) {
    const snap = listingFromPage(doc);
    if (snap.vehicles.length) return true;
    const text = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    return /used inventory|pre-owned|certified/i.test(text) && /stock/i.test(text);
  }

  function readOnce(kind) {
    const doc = typeof document !== "undefined" ? document : null;
    const challenge = challengeOf(doc);
    const html = doc?.documentElement?.outerHTML || "";
    const title = doc?.title || "";
    const url = typeof location !== "undefined" ? location.href : "";
    const ddc = snapshotDdc();
    const extracted =
      typeof LotLinkerVdpPrice !== "undefined"
        ? LotLinkerVdpPrice.extractFromDocument(doc, { html, title, ddc, url })
        : { found: false, reason: "extractor-missing" };
    const listing = kind === "listing" ? listingFromPage(doc) : { vehicles: [], expectedTotal: 0, html };
    const ready = kind === "listing" ? listingReady(doc) : vdpReady(doc) || extracted.found;
    return {
      ok: kind === "listing" ? listing.vehicles.length > 0 : Boolean(extracted.found),
      ready: Boolean(ready) && !challenge,
      kind: kind || "vdp",
      url,
      title,
      challenge,
      extracted: challenge ? { found: false, total: 0, reason: challenge, tried: ["challenge"] } : extracted,
      vehicles: listing.vehicles,
      expectedTotal: listing.expectedTotal,
      htmlLength: html.length,
    };
  }

  async function read({ kind, timeoutMs } = {}) {
    const deadline = Date.now() + (timeoutMs || 12000);
    let last = readOnce(kind);
    if (last.challenge) return last;
    while (Date.now() < deadline) {
      last = readOnce(kind);
      if (last.challenge) return last;
      if (last.ok || last.ready) return last;
      await sleep(250);
    }
    if (!last.extracted) last.extracted = { found: false, total: 0, reason: "widget-timeout" };
    if (!last.extracted.found && !last.extracted.reason) last.extracted.reason = "widget-timeout";
    last.reason = last.extracted.reason || "widget-timeout";
    return last;
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage && typeof document !== "undefined") {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "LOT_LINKER_DEALER_READ") return;
      read({ kind: msg.kind || "vdp", timeoutMs: msg.timeoutMs })
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: String(e), extracted: { found: false, reason: "tab-error" } }));
      return true;
    });
  }

  return { snapshotDdc, readOnce, read, vdpReady, listingReady };
});
