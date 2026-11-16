// Lot Linker Fill — photos off the Facebook page, sold badge, live dealer tab reads.
// Never downloads. Never posts. Content script places File objects on the picker.
importScripts("vdp-price.js", "inventory-live.js", "content-dealer.js", "sold-watch.js", "photos.js");

const TAB_CONCURRENCY = 3;
const TAB_TIMEOUT_MS = 15000;
const DEALER_FILES = ["vdp-price.js", "inventory-live.js", "content-dealer.js"];

function refreshSoldBadge() {
  const api = self.LotLinkerSold;
  chrome.storage.local.get(["soldWatch", "soldDismissed"], (stored) => {
    const n = api ? api.undismissedCount(stored.soldWatch, stored.soldDismissed) : 0;
    chrome.action.setBadgeText({ text: api ? api.badgeText(n) : n ? String(n) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  });
}

chrome.runtime.onInstalled.addListener(refreshSoldBadge);
chrome.runtime.onStartup.addListener(refreshSoldBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.soldWatch || changes.soldDismissed)) refreshSoldBadge();
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("tab-timeout"));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(t);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(t);
        resolve();
      }
    });
  });
}

async function injectDealer(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: DEALER_FILES,
  });
}

async function readInjected(tabId, kind, timeoutMs) {
  const [got] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (k, ms) => {
      const api = window.LotLinkerDealerRead;
      if (!api?.read) return { ok: false, extracted: { found: false, reason: "injector-missing" } };
      return api.read({ kind: k, timeoutMs: ms });
    },
    args: [kind || "vdp", timeoutMs || 12000],
  });
  return got?.result || { ok: false, extracted: { found: false, reason: "no-script-result" } };
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already gone */
  }
}

async function readDealerUrl(url, kind) {
  const href = String(url || "");
  if (!href) {
    return { ok: false, error: "no-vdp-url", extracted: { found: false, reason: "no-vdp-url" } };
  }
  let tabId = 0;
  try {
    const tab = await chrome.tabs.create({ url: href, active: false });
    tabId = tab.id;
    try {
      await waitTabComplete(tabId, TAB_TIMEOUT_MS);
    } catch {
      /* still try to read whatever rendered */
    }
    await injectDealer(tabId);
    const result = await readInjected(tabId, kind, 12000);
    if (result?.challenge) {
      result.blocked = true;
      result.status = 403;
      if (result.extracted) result.extracted.reason = result.extracted.reason || result.challenge;
    }
    return result;
  } catch (e) {
    const msg = String(e?.message || e || "tab-error");
    const reason = /timeout/i.test(msg) ? "widget-timeout" : "tab-error";
    return { ok: false, error: msg, extracted: { found: false, reason } };
  } finally {
    if (tabId) await closeTab(tabId);
  }
}

async function mapPool(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  }
  const n = Math.max(1, Math.min(limit || TAB_CONCURRENCY, list.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function readDealerBatch(items, concurrency) {
  return mapPool(items, concurrency || TAB_CONCURRENCY, async (item) => {
    const url = item?.url || "";
    const kind = item?.kind || "vdp";
    const row = await readDealerUrl(url, kind);
    return { stock: item?.stock || "", url, kind, ...row };
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LOT_LINKER_SOLD_BADGE") {
    refreshSoldBadge();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "LOT_LINKER_READ_DEALER") {
    readDealerUrl(msg.url, msg.kind || "vdp")
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: String(e), extracted: { found: false, reason: "tab-error" } }));
    return true;
  }
  if (msg?.type === "LOT_LINKER_READ_DEALER_BATCH") {
    readDealerBatch(msg.items || [], msg.concurrency || TAB_CONCURRENCY)
      .then((rows) => sendResponse({ ok: true, rows }))
      .catch((e) => sendResponse({ ok: false, error: String(e), rows: [] }));
    return true;
  }
  if (msg?.type !== "LOT_LINKER_PREPARE_PHOTOS") return;
  const api = self.LotLinkerPhotos;
  if (!api) {
    sendResponse({ ok: false, error: "Photo module missing" });
    return true;
  }
  api
    .prepareTransfer(msg.pack || {})
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
