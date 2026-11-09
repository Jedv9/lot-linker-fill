// Lot Linker Fill — fetch + banner-strip photos off the Facebook page (no Referer).
// Never downloads. Never posts. Content script places File objects on the picker.
importScripts("sold-watch.js", "photos.js");

function refreshSoldBadge() {
  const api = self.LotLinkerSold;
  chrome.storage.local.get(["soldWatch", "soldDismissed"], (stored) => {
    const n = api ? api.undismissedCount(stored.soldWatch, stored.soldDismissed) : 0;
    chrome.action.setBadgeText({ text: api ? api.badgeText(n) : (n ? String(n) : "") });
    chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  });
}

chrome.runtime.onInstalled.addListener(refreshSoldBadge);
chrome.runtime.onStartup.addListener(refreshSoldBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.soldWatch || changes.soldDismissed)) refreshSoldBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LOT_LINKER_SOLD_BADGE") {
    refreshSoldBadge();
    sendResponse({ ok: true });
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
