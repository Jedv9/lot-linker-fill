// Lot Linker Fill — photos + open create/vehicle then fill. Never home. Never Post.
importScripts("photos.js", "fb-nav.js");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nav() {
  return self.LotLinkerFbNav;
}

function createVehicleUrl() {
  const api = nav();
  return api?.createVehicleListingUrl() || "https://www.facebook.com/marketplace/create/vehicle";
}

function refuseIfUnsafe(url) {
  const api = nav();
  if (!api) return createVehicleUrl();
  if (api.isFacebookHomeUrl(url) || api.isForbiddenNavigationUrl(url) || !api.isSafeFillDestination(url)) {
    throw new Error("Refusing to navigate to Facebook home or a non-create URL");
  }
  return url;
}

function tabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const api = nav();
    let settled = false;
    const finish = (tab, err) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (err) reject(err);
      else resolve(tab);
    };
    const onUpdated = (id, info, tab) => {
      if (id !== tabId || info.status !== "complete") return;
      const href = tab.url || "";
      if (api?.isFacebookHomeUrl(href)) {
        finish(null, new Error("Navigation landed on Facebook home — refused"));
        return;
      }
      if (api?.isCreateVehicleListingUrl(href)) finish(tab);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      const href = tab.url || "";
      if (tab.status === "complete" && api?.isCreateVehicleListingUrl(href)) finish(tab);
    }).catch(() => {});
    setTimeout(() => {
      chrome.tabs.get(tabId).then((tab) => {
        const href = tab.url || "";
        if (api?.isFacebookHomeUrl(href)) {
          finish(null, new Error("Timed out on Facebook home"));
          return;
        }
        finish(tab);
      }).catch((e) => finish(null, e));
    }, timeoutMs);
  });
}

async function send(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (r) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || String(err)));
      else resolve(r);
    });
  });
}

async function ensureContent(tabId) {
  try {
    const ping = await send(tabId, { type: "LOT_LINKER_FORM_READY" });
    if (ping) return ping;
  } catch {
    /* inject */
  }
  if (chrome.scripting?.executeScript) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["listing-copy.js", "photos.js", "posted.js", "fb-nav.js", "content-fb.js"],
    });
    return send(tabId, { type: "LOT_LINKER_FORM_READY" });
  }
  throw new Error("Content script not ready — refresh the Facebook tab");
}

async function waitFormReady(tabId) {
  for (let i = 0; i < 30; i++) {
    try {
      const ping = await ensureContent(tabId);
      if (ping?.isHome) throw new Error("Landed on Facebook home — will not fill");
      if (ping?.ready || ping?.isCreate) {
        if (ping.ready) return ping;
      }
    } catch (e) {
      if (/home/i.test(String(e.message || e))) throw e;
    }
    await delay(300);
  }
  try {
    return await ensureContent(tabId);
  } catch {
    return { ready: false };
  }
}

async function resolveFillTab(requestedTabId) {
  const api = nav();
  const requested = await chrome.tabs.get(requestedTabId);
  if (api?.isFacebookUrl(requested.url)) return requested.id;

  let fbTabs = [];
  try {
    fbTabs = await chrome.tabs.query({ url: ["https://www.facebook.com/*", "https://facebook.com/*"] });
  } catch {
    fbTabs = [];
  }
  const createTab = fbTabs.find((t) => api?.isCreateVehicleListingUrl(t.url));
  if (createTab?.id) {
    await chrome.tabs.update(createTab.id, { active: true });
    return createTab.id;
  }
  const anyFb = fbTabs[0];
  if (anyFb?.id) {
    await chrome.tabs.update(anyFb.id, { active: true });
    return anyFb.id;
  }
  const opened = await chrome.tabs.create({ url: refuseIfUnsafe(createVehicleUrl()), active: true });
  return opened.id;
}

async function openCreateVehicle(tabId) {
  const url = refuseIfUnsafe(createVehicleUrl());
  await chrome.tabs.update(tabId, { url });
  await tabComplete(tabId);
  const tab = await chrome.tabs.get(tabId);
  if (nav()?.isFacebookHomeUrl(tab.url)) {
    throw new Error("Facebook opened home instead of create vehicle listing");
  }
  return tab;
}

async function fillTab({ pack, tabId }) {
  const api = nav();
  const id = await resolveFillTab(tabId);
  const tab = await chrome.tabs.get(id);
  const target = api?.navigationTarget(tab.url) || { action: "navigate", url: createVehicleUrl() };
  refuseIfUnsafe(target.url);
  if (target.action === "navigate") {
    await openCreateVehicle(id);
  }
  const ready = await waitFormReady(id);
  if (ready?.isHome) {
    return { ok: false, error: "On Facebook home — refused to fill" };
  }
  if (!ready?.ready) {
    await delay(400);
  }
  try {
    const res = await send(id, { type: "LOT_LINKER_FILL", pack });
    if (res?.needNavigate && res.url && api?.isSafeFillDestination(res.url)) {
      await openCreateVehicle(id);
      await waitFormReady(id);
      return await send(id, { type: "LOT_LINKER_FILL", pack });
    }
    return res;
  } catch (e) {
    await ensureContent(id);
    return send(id, { type: "LOT_LINKER_FILL", pack });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LOT_LINKER_PREPARE_PHOTOS") {
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
  }
  if (msg?.type !== "LOT_LINKER_FILL_TAB") return;
  fillTab({ pack: msg.pack || {}, tabId: msg.tabId })
    .then((r) => sendResponse(r || { ok: false, error: "Fill failed" }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
