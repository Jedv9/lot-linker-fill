// Lot Linker Fill — fetch + banner-strip photos off the Facebook page (no Referer).
// Never downloads. Never posts. Content script places File objects on the picker.
importScripts("photos.js");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
