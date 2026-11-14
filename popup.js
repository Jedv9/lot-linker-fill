let packs = [];
let selected = null;
let researchPromise = null;
let researchStock = null;
let soldWatch = [];
let soldDismissed = {};
let listedStocks = {};

const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t || ""; };

function listingFor(pack) {
  return (typeof LotLinkerListing !== "undefined" && LotLinkerListing.fromPack)
    ? LotLinkerListing.fromPack(pack)
    : { title: pack?.title || "", modelLine: pack?.modelLine || "", body: pack?.body || "" };
}

function soldApi() {
  return typeof LotLinkerSold !== "undefined" ? LotLinkerSold : null;
}

function showRefreshMeta(iso) {
  const el = $("refreshMeta");
  if (!el) return;
  if (!iso) {
    el.textContent = "";
    return;
  }
  try {
    el.textContent = `Last refreshed: ${new Date(iso).toLocaleString()}`;
  } catch {
    el.textContent = `Last refreshed: ${iso}`;
  }
}

function uniqueSorted(vals) {
  return [...new Set(vals.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true })
  );
}

function currentDealerPacks(list) {
  const rows = Array.isArray(list) ? list : [];
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.isCurrentDealerPack) {
    return rows.filter((p) => LotLinkerListing.isCurrentDealerPack(p));
  }
  return rows.filter((p) => /lexus of brookfield|lexusofbrookfield/i.test([p?.rooftop, p?.vdpUrl].join(" ")));
}

function withDealerFees(pack) {
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.advertisedPack) {
    return LotLinkerListing.advertisedPack(pack);
  }
  return pack;
}

function normalizePacks(list) {
  return currentDealerPacks(list).map(withDealerFees);
}

async function overlayVdpTotals(list) {
  if (typeof LotLinkerVdpPrice === "undefined" || !LotLinkerVdpPrice.overlayLiveTotals) {
    return { packs: list, found: 0, missing: list.length };
  }
  return LotLinkerVdpPrice.overlayLiveTotals(list, {
    fetchFn: async (url) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch(url, {
          credentials: "omit",
          headers: { accept: "text/html,application/xhtml+xml" },
        });
        if (res.status === 429 || res.status === 503) {
          const ra = Number(res.headers.get("retry-after") || 0);
          const wait = ra > 0 ? ra * 1000 : 8000 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, Math.min(wait, 60000)));
          continue;
        }
        if (!res.ok) return "";
        return res.text();
      }
      return "";
    },
    onProgress: ({ i, total, stock }) => {
      status(`Reading live Total Sale Price ${i + 1}/${total}${stock ? ` · ${stock}` : ""}`);
    },
    gapMs: 1200,
  });
}

function payloadMeta(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { complete: true, expectedTotal: 0, soldHistory: [], sold: [] };
  }
  return {
    complete: data.complete,
    expectedTotal: data.expectedTotal,
    soldHistory: Array.isArray(data.soldHistory) ? data.soldHistory : [],
    sold: Array.isArray(data.sold) ? data.sold : [],
  };
}

async function persistSoldState({
  previousPacks,
  nextPacks,
  payload,
  now,
  skipClientDetect = false,
} = {}) {
  const api = soldApi();
  if (!api) return;
  const next = Array.isArray(nextPacks) ? nextPacks : packs;
  const detectedAt = now || new Date().toISOString();
  const incoming = api.rowsFromPayload(payload);
  const detected = skipClientDetect
    ? { sold: [], skipped: "no-baseline" }
    : api.detectSold({
      previousPacks,
      nextPacks: next,
      complete: payload?.complete,
      expectedTotal: payload?.expectedTotal,
      now: detectedAt,
    });
  soldWatch = api.mergeSoldHistory(
    soldWatch,
    [...incoming, ...(detected.skipped ? [] : detected.sold)],
    {
      now: detectedAt,
      liveStocks: next.map((p) => p.stock),
    }
  );
  soldDismissed = api.pruneDismissed(soldDismissed, next.map((p) => p.stock));
  const summaries = next.map((p) => api.packSummary(p));
  await chrome.storage.local.set({
    soldWatch,
    soldDismissed,
    lastSeenSummaries: summaries,
    lastSoldPayload: payloadMeta(payload),
  });
  renderSold();
}

function renderSold() {
  const api = soldApi();
  const section = $("soldSection");
  const list = $("soldList");
  const countEl = $("soldCount");
  if (!section || !list) return;
  if (!api) {
    section.hidden = true;
    return;
  }
  const open = api.sortSoldForDisplay(
    api.undismissedSold(soldWatch, soldDismissed),
    listedStocks
  );
  if (!open.length) {
    section.hidden = true;
    list.innerHTML = "";
    if (countEl) countEl.textContent = "";
    return;
  }
  section.hidden = false;
  if (countEl) countEl.textContent = `${open.length} to take down`;
  list.innerHTML = "";
  for (const row of open) {
    const item = document.createElement("div");
    const flagged = api.isListed(listedStocks, row.stock);
    item.className = flagged ? "sold-item listed" : "sold-item";
    item.dataset.stock = row.stock;
    const name = document.createElement("div");
    name.className = "sold-name";
    name.textContent = api.soldHeadline(row);
    if (flagged) {
      const chip = document.createElement("span");
      chip.className = "sold-chip";
      chip.textContent = "Listed";
      name.appendChild(chip);
    }
    const meta = document.createElement("div");
    meta.className = "sold-meta";
    meta.textContent = api.soldMeta(row);
    const when = document.createElement("div");
    when.className = "sold-date";
    when.textContent = api.soldDateLabel(row);
    const actions = document.createElement("div");
    actions.className = "sold-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "taken";
    btn.dataset.stock = row.stock;
    btn.textContent = "Taken down";
    actions.appendChild(btn);
    item.appendChild(name);
    item.appendChild(meta);
    if (when.textContent) item.appendChild(when);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

async function dismissSold(stock) {
  const api = soldApi();
  if (!api || !stock) return;
  soldDismissed = api.markDismissed(soldDismissed, stock, new Date().toISOString());
  await chrome.storage.local.set({ soldDismissed });
  renderSold();
  status(`Taken down: ${stock}`);
}

async function setListed(stock, on) {
  const api = soldApi();
  if (!api || !stock) return;
  listedStocks = api.toggleListed(listedStocks, stock, on);
  await chrome.storage.local.set({ listedStocks });
  renderSold();
}

async function loadBundled() {
  const res = await fetch(chrome.runtime.getURL("packs.json"));
  const data = await res.json();
  const bundled = normalizePacks(data.packs || []);
  const stored = await chrome.storage.local.get([
    "packsOverride",
    "packsRefreshedAt",
    "soldWatch",
    "soldDismissed",
    "listedStocks",
    "lastSeenSummaries",
    "lastSoldPayload",
  ]);
  const override = normalizePacks(stored.packsOverride);
  packs = override.length ? override : bundled;
  soldWatch = Array.isArray(stored.soldWatch) ? stored.soldWatch : [];
  soldDismissed = stored.soldDismissed && typeof stored.soldDismissed === "object" ? stored.soldDismissed : {};
  listedStocks = stored.listedStocks && typeof stored.listedStocks === "object" ? stored.listedStocks : {};
  if (override.length) {
    await chrome.storage.local.set({ packsOverride: override });
  }
  const hasBaseline = Array.isArray(stored.lastSeenSummaries) && stored.lastSeenSummaries.length;
  const payload = {
    ...payloadMeta(data),
    ...payloadMeta(stored.lastSoldPayload),
    soldHistory: [
      ...payloadMeta(stored.lastSoldPayload).soldHistory,
      ...payloadMeta(data).soldHistory,
    ],
    sold: [
      ...payloadMeta(stored.lastSoldPayload).sold,
      ...payloadMeta(data).sold,
    ],
    complete: override.length ? stored.lastSoldPayload?.complete : data.complete,
    expectedTotal: override.length ? stored.lastSoldPayload?.expectedTotal : data.expectedTotal,
  };
  await persistSoldState({
    previousPacks: stored.lastSeenSummaries || [],
    nextPacks: packs,
    payload,
    skipClientDetect: !hasBaseline,
  });
  fillStoreFilter();
  renderList();
  renderSold();
  showRefreshMeta(override.length ? stored.packsRefreshedAt : "");
}

function fillStoreFilter() {
  const sel = $("fStore");
  if (!sel) return;
  const prev = sel.value;
  const stores = uniqueSorted(packs.map((p) => p.rooftop || ""));
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All stores";
  sel.appendChild(all);
  for (const store of stores) {
    const opt = document.createElement("option");
    opt.value = store;
    opt.textContent = store;
    sel.appendChild(opt);
  }
  sel.value = stores.includes(prev) ? prev : "";
}

function applyFilters() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const store = $("fStore")?.value || "";
  return packs.filter((p) => {
    if (store && (p.rooftop || "") !== store) return false;
    if (!q) return true;
    const hay = [p.stock, p.vin, p.year, p.make, p.model, p.trim].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function packPickerLabel(pack) {
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.pickerLabel) {
    return LotLinkerListing.pickerLabel(pack);
  }
  const name = [pack?.year, pack?.make, pack?.model, pack?.trim].filter(Boolean).join(" ");
  return [pack?.stock, name].filter(Boolean).join(" · ");
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const filtered = applyFilters();
  for (const p of filtered) {
    const opt = document.createElement("option");
    opt.value = p.stock;
    opt.textContent = packPickerLabel(p);
    list.appendChild(opt);
  }
  if (!filtered.length) status("No matches");
  else status(`${filtered.length} shown · ${packs.length} total`);
  if (selected && !filtered.some((p) => p.stock === selected.stock)) showPack(null);
}

function photoMetaText(pack) {
  const n = pack?.photoUrls?.length || 0;
  if (n) return `${n} cached photo URL${n === 1 ? "" : "s"} · VDP used if more exist`;
  if (pack?.vdpUrl) return "Photos from VDP (banner stripped on Fill)";
  return "No photo source";
}

function renderListing(pack) {
  const listing = listingFor(pack);
  const pick = $("mPick");
  if (pick) pick.textContent = packPickerLabel(pack);
  $("mTitle").textContent = listing.modelLine || listing.title;
  const photos = $("mPhotos");
  if (photos) photos.textContent = photoMetaText(pack);
  $("mBody").textContent = listing.body;
  const priceWarn = $("priceWarn");
  if (priceWarn) {
    const missing = pack?.priceMissing || !listingFor(pack) || (typeof LotLinkerListing !== "undefined" && !LotLinkerListing.advertisedPrice(pack));
    priceWarn.hidden = !missing;
  }
  const listed = $("listedOnFb");
  if (listed) {
    const api = soldApi();
    listed.checked = api ? api.isListed(listedStocks, pack?.stock) : false;
  }
}

async function ensureResearched(pack) {
  if (!pack) return pack;
  if (typeof LotLinkerListing === "undefined") return pack;
  if (!LotLinkerListing.needsResearch?.(pack)) return pack;
  if (pack._researched) return pack;
  if (researchStock === pack.stock && researchPromise) return researchPromise;
  researchStock = pack.stock;
  researchPromise = LotLinkerListing.researchPack(pack, { timeoutMs: 10000 })
    .then((enriched) => {
      enriched._researched = true;
      return enriched;
    })
    .catch(() => pack);
  return researchPromise;
}

function showPack(p) {
  selected = p;
  researchPromise = null;
  researchStock = null;
  $("card").hidden = !p;
  $("fill").disabled = !p;
  if ($("savePhotos")) $("savePhotos").disabled = !p;
  if (!p) return;
  renderListing(p);
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.needsResearch?.(p)) {
    status("Researching features from VDP…");
    ensureResearched(p).then((enriched) => {
      if (!selected || selected.stock !== p.stock) return;
      const before = LotLinkerListing.keyEquipment(p);
      const after = LotLinkerListing.keyEquipment(enriched);
      selected = enriched;
      renderListing(enriched);
      const added = after.filter((f) => !before.includes(f));
      status(added.length ? `Researched +${added.length}: ${added.join(", ")}` : `${after.length} verified features`);
    });
  }
}

$("q").addEventListener("input", () => renderList());
$("fStore")?.addEventListener("change", () => renderList());
$("list").addEventListener("change", () => {
  const p = packs.find((x) => x.stock === $("list").value);
  showPack(p || null);
});
$("soldList")?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.("button.taken");
  if (!btn?.dataset?.stock) return;
  dismissSold(btn.dataset.stock);
});
$("listedOnFb")?.addEventListener("change", () => {
  if (!selected?.stock) return;
  setListed(selected.stock, $("listedOnFb").checked);
});

$("fill").onclick = async () => {
  if (!selected) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("No active tab");
  if (!/facebook\.com/i.test(tab.url || "")) {
    return status("Open a facebook.com Marketplace create tab first");
  }
  try {
    const pack = withDealerFees(await ensureResearched(selected));
    if (pack.priceMissing || !(typeof LotLinkerListing !== "undefined" && LotLinkerListing.advertisedPrice(pack))) {
      status("Total Sale Price missing on dealer site — not filling a computed price");
    }
    selected = pack;
    renderListing(pack);
    const res = await chrome.tabs.sendMessage(tab.id, { type: "LOT_LINKER_FILL", pack });
    if (res?.ok) {
      await setListed(pack.stock, true);
      const listed = $("listedOnFb");
      if (listed) listed.checked = true;
      const bits = [`Filled: ${res.filled?.join(", ") || "ok"}`];
      if (res.missed?.length) bits.push(`missed: ${res.missed.join(", ")}`);
      if (res.photos?.count) {
        bits.push(`${res.photos.count} photos`);
        if (res.photos.stripped) bits.push("banner stripped");
      }
      if (res.photos?.error) bits.push(res.photos.error);
      if (res.descriptionHit && res.filled?.includes("description")) {
        bits.push(`via ${res.descriptionHit}`);
      }
      status(bits.join(" · "));
    } else {
      status(res?.error || "Fill failed");
    }
  } catch {
    status("Content script not ready — refresh the Facebook tab, then try again");
  }
};

$("refreshInventory").onclick = async () => {
  const url = (typeof LOT_LINKER_PACKS_URL !== "undefined" && LOT_LINKER_PACKS_URL)
    ? LOT_LINKER_PACKS_URL
    : "https://raw.githubusercontent.com/Jedv9/lot-linker-fill/main/packs.json";
  status("Refreshing packs from GitHub…");
  try {
    const res = await fetch(`${url}?t=${Date.now()}`);
    if (!res.ok) {
      status(`Refresh failed: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const remote = currentDealerPacks(Array.isArray(data) ? data : (data.packs || []));
    if (!remote.length) {
      status("Refresh failed: no Lexus of Brookfield pre-owned packs in remote JSON");
      return;
    }
    const api = soldApi();
    const previousCount = packs.length;
    const trusted = !api || api.isTrustedComplete({
      complete: data.complete,
      expectedTotal: data.expectedTotal,
      nextCount: remote.length,
      previousCount,
    });
    if (!trusted) {
      status("Refresh skipped: remote packs look incomplete (not treating as mass sold)");
      return;
    }
    status(`Reading live Total Sale Price for ${remote.length} vehicles…`);
    const overlay = await overlayVdpTotals(remote);
    const previousPacks = packs;
    packs = overlay.packs;
    const at = new Date().toISOString();
    await persistSoldState({
      previousPacks,
      nextPacks: packs,
      payload: payloadMeta(data),
      now: at,
    });
    await chrome.storage.local.set({
      packsOverride: packs,
      packsRefreshedAt: at,
      packsSource: url,
    });
    fillStoreFilter();
    renderList();
    renderSold();
    if (selected) {
      const fresh = packs.find((p) => p.stock === selected.stock);
      showPack(fresh || null);
    }
    showRefreshMeta(at);
    const gone = soldApi()?.undismissedCount(soldWatch, soldDismissed) || 0;
    const missing = overlay.missing ? ` · ${overlay.missing} missing Total Sale Price` : "";
    const goneBit = gone ? ` · ${gone} sold to take down` : "";
    status(`Refreshed ${packs.length} packs · ${overlay.found} live Total Sale Price${missing} · ${new Date(at).toLocaleString()}${goneBit}`);
  } catch (e) {
    status(`Refresh failed: network error (${e?.message || e})`);
  }
};

$("savePhotos")?.addEventListener("click", async () => {
  if (!selected) return;
  status("Saving photos (fallback)…");
  try {
    const pack = await ensureResearched(selected);
    const res = await chrome.runtime.sendMessage({ type: "LOT_LINKER_PREPARE_PHOTOS", pack });
    if (!res?.ok || !res.files?.length) {
      status(res?.error || "No photos to save");
      return;
    }
    const stock = String(pack.stock || "unit").replace(/[^\w.-]/g, "_");
    let n = 0;
    for (const f of res.files) {
      const url = `data:${f.type || "image/jpeg"};base64,${f.base64}`;
      await chrome.downloads.download({
        url,
        filename: `LotLinkerPhotos/${stock}/${f.name}`,
        conflictAction: "uniquify",
        saveAs: false,
      });
      n += 1;
    }
    status(`Saved ${n} photos → Downloads/LotLinkerPhotos/${stock} (fallback — prefer Fill)`);
  } catch (e) {
    status(`Photo save failed: ${e?.message || e}`);
  }
});

loadBundled();
