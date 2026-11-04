/**
 * Lot Linker Fill — posted / not-posted marks keyed by stock number.
 * Survives popup close, browser restart, and Refresh packs.
 * Manual mark is the source of truth; auto-detect only marks after a
 * user Post click plus a success URL or success toast.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerPosted = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const STORAGE_KEY = "postedByStock";
  const PENDING_KEY = "pendingMarketplacePost";
  const PENDING_TTL_MS = 30 * 60 * 1000;
  const POST_CLICK_TTL_MS = 2 * 60 * 1000;

  function stockKey(stock) {
    return String(stock == null ? "" : stock).trim();
  }

  function emptyMap() {
    return {};
  }

  function asMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return emptyMap();
    return value;
  }

  function isPosted(map, stock) {
    const k = stockKey(stock);
    if (!k) return false;
    const v = asMap(map)[k];
    if (!v) return false;
    if (v === true) return true;
    if (typeof v === "string") return Boolean(v.trim());
    if (typeof v === "object") return v.posted !== false && Boolean(v.at || v.posted);
    return false;
  }

  function markInMap(map, stock, posted, at) {
    const next = { ...asMap(map) };
    const k = stockKey(stock);
    if (!k) return next;
    if (posted) {
      next[k] = { posted: true, at: at || new Date().toISOString() };
    } else {
      delete next[k];
    }
    return next;
  }

  function countNotPosted(packs, map) {
    return (packs || []).filter((p) => !isPosted(map, p?.stock)).length;
  }

  function applyPostedFilter(packs, map, mode) {
    const m = String(mode || "not").toLowerCase();
    return (packs || []).filter((p) => {
      const posted = isPosted(map, p?.stock);
      if (m === "posted") return posted;
      if (m === "all") return true;
      return !posted;
    });
  }

  function leftLabel(n) {
    const count = Number(n) || 0;
    return `${count} left`;
  }

  function storageAvailable() {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!storageAvailable()) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, (r) => resolve(r || {}));
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      if (!storageAvailable()) {
        resolve();
        return;
      }
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      if (!storageAvailable()) {
        resolve();
        return;
      }
      chrome.storage.local.remove(keys, () => resolve());
    });
  }

  async function loadMap() {
    const stored = await storageGet([STORAGE_KEY]);
    return asMap(stored[STORAGE_KEY]);
  }

  async function saveMap(map) {
    await storageSet({ [STORAGE_KEY]: asMap(map) });
    return asMap(map);
  }

  async function setPosted(stock, posted) {
    const map = await loadMap();
    const next = markInMap(map, stock, posted);
    await saveMap(next);
    return next;
  }

  async function rememberPendingFill(stock) {
    const k = stockKey(stock);
    if (!k) return null;
    const pending = { stock: k, filledAt: Date.now() };
    await storageSet({ [PENDING_KEY]: pending });
    return pending;
  }

  async function noteUserClickedPost() {
    const stored = await storageGet([PENDING_KEY]);
    const pending = stored[PENDING_KEY];
    if (!pending?.stock) return null;
    const next = { ...pending, userClickedPostAt: Date.now() };
    await storageSet({ [PENDING_KEY]: next });
    return next;
  }

  async function clearPending() {
    await storageRemove([PENDING_KEY]);
  }

  function pendingStillLive(pending, now) {
    const t = now || Date.now();
    if (!pending?.stock || !pending.filledAt) return false;
    if (t - Number(pending.filledAt) > PENDING_TTL_MS) return false;
    if (!pending.userClickedPostAt) return false;
    if (t - Number(pending.userClickedPostAt) > POST_CLICK_TTL_MS) return false;
    return true;
  }

  function looksLikePostSuccessUrl(href) {
    const s = String(href || "");
    if (!s) return false;
    if (/marketplace\/create/i.test(s)) return false;
    if (/\/marketplace\/item\/\d+/i.test(s)) return true;
    if (/\/marketplace\/item\//i.test(s)) return true;
    return false;
  }

  function looksLikePostSuccessText(text) {
    const t = String(text || "").replace(/\s+/g, " ");
    if (!t) return false;
    return (
      /your listing is (now )?live/i.test(t) ||
      /listing (is )?now live/i.test(t) ||
      /your listing (was|has been) (created|published)/i.test(t) ||
      /listing (successfully )?(created|published)/i.test(t) ||
      /your vehicle is now listed/i.test(t)
    );
  }

  function shortClickLabel(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isUserPublishClickLabel(label) {
    const t = shortClickLabel(label);
    if (!t || t.length > 40) return false;
    return /^(post|publish|publish listing|create listing|post listing)$/i.test(t);
  }

  async function maybeMarkPendingPosted({ href, text, now } = {}) {
    const stored = await storageGet([PENDING_KEY, STORAGE_KEY]);
    const pending = stored[PENDING_KEY];
    if (!pendingStillLive(pending, now)) return null;
    const urlOk = looksLikePostSuccessUrl(href);
    const textOk = looksLikePostSuccessText(text);
    if (!urlOk && !textOk) return null;
    const next = markInMap(stored[STORAGE_KEY], pending.stock, true);
    await saveMap(next);
    await clearPending();
    return pending.stock;
  }

  return {
    STORAGE_KEY,
    PENDING_KEY,
    PENDING_TTL_MS,
    POST_CLICK_TTL_MS,
    stockKey,
    asMap,
    isPosted,
    markInMap,
    countNotPosted,
    applyPostedFilter,
    leftLabel,
    loadMap,
    saveMap,
    setPosted,
    rememberPendingFill,
    noteUserClickedPost,
    clearPending,
    pendingStillLive,
    looksLikePostSuccessUrl,
    looksLikePostSuccessText,
    isUserPublishClickLabel,
    maybeMarkPendingPosted,
  };
});
