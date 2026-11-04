let packs = [];
let selected = null;
let researchPromise = null;
let researchStock = null;
let postedMap = {};

const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t || ""; };

function listingFor(pack) {
  return (typeof LotLinkerListing !== "undefined" && LotLinkerListing.fromPack)
    ? LotLinkerListing.fromPack(pack)
    : { title: pack?.title || "", modelLine: pack?.modelLine || "", body: pack?.body || "" };
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

async function loadBundled() {
  const res = await fetch(chrome.runtime.getURL("packs.json"));
  const data = await res.json();
  const bundled = data.packs || [];
  const stored = await chrome.storage.local.get(["packsOverride", "packsRefreshedAt", "postedByStock"]);
  packs = stored.packsOverride?.length ? stored.packsOverride : bundled;
  postedMap = (typeof LotLinkerPosted !== "undefined" && LotLinkerPosted.asMap)
    ? LotLinkerPosted.asMap(stored.postedByStock)
    : (stored.postedByStock || {});
  fillStoreFilter();
  renderList();
  showRefreshMeta(stored.packsRefreshedAt);
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

function searchStoreFiltered() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const store = $("fStore")?.value || "";
  return packs.filter((p) => {
    if (store && (p.rooftop || "") !== store) return false;
    if (!q) return true;
    const hay = [p.stock, p.vin, p.year, p.make, p.model, p.trim].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function applyFilters() {
  const base = searchStoreFiltered();
  if (typeof LotLinkerPosted === "undefined" || !LotLinkerPosted.applyPostedFilter) return base;
  const mode = $("fPosted")?.value || "not";
  return LotLinkerPosted.applyPostedFilter(base, postedMap, mode);
}

function stockIsPosted(stock) {
  return typeof LotLinkerPosted !== "undefined" && LotLinkerPosted.isPosted
    ? LotLinkerPosted.isPosted(postedMap, stock)
    : false;
}

function updateLeftCount() {
  const el = $("leftCount");
  if (!el) return;
  const n = typeof LotLinkerPosted !== "undefined" && LotLinkerPosted.countNotPosted
    ? LotLinkerPosted.countNotPosted(searchStoreFiltered(), postedMap)
    : searchStoreFiltered().length;
  el.textContent = typeof LotLinkerPosted !== "undefined" && LotLinkerPosted.leftLabel
    ? LotLinkerPosted.leftLabel(n)
    : `${n} left`;
}

function updatePostedControls() {
  const btn = $("togglePosted");
  const state = $("mPosted");
  const posted = selected ? stockIsPosted(selected.stock) : false;
  if (btn) {
    btn.disabled = !selected;
    btn.textContent = posted ? "Mark not posted" : "Mark posted";
  }
  if (state) state.textContent = selected ? (posted ? "Posted" : "Not posted") : "";
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
  const filtered = applyFilters();
  if (selected && !filtered.some((p) => p.stock === selected.stock)) {
    showPack(null);
  }
  list.innerHTML = "";
  for (const p of filtered) {
    const row = document.createElement("div");
    row.className = "item" + (selected && selected.stock === p.stock ? " sel" : "");
    row.dataset.stock = p.stock;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected && selected.stock === p.stock ? "true" : "false");

    const lab = document.createElement("div");
    lab.className = "lab";
    lab.textContent = packPickerLabel(p);

    const posted = stockIsPosted(p.stock);
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "mark" + (posted ? " posted" : "");
    mark.textContent = posted ? "Posted" : "Not posted";
    mark.title = posted ? "Click to mark not posted" : "Click to mark posted";
    mark.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePosted(p.stock);
    });

    row.appendChild(lab);
    row.appendChild(mark);
    row.addEventListener("click", () => {
      const pack = packs.find((x) => x.stock === p.stock);
      showPack(pack || null);
      renderList();
    });
    list.appendChild(row);
  }
  updateLeftCount();
  updatePostedControls();
  if (!filtered.length) status("No matches");
  else status(`${filtered.length} shown · ${packs.length} total`);
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
  updatePostedControls();
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

async function togglePosted(stock) {
  if (!stock || typeof LotLinkerPosted === "undefined" || !LotLinkerPosted.setPosted) return;
  const nextPosted = !stockIsPosted(stock);
  postedMap = await LotLinkerPosted.setPosted(stock, nextPosted);
  renderList();
  if (selected && selected.stock === stock) updatePostedControls();
}

$("q").addEventListener("input", () => renderList());
$("fStore")?.addEventListener("change", () => renderList());
$("fPosted")?.addEventListener("change", () => renderList());
$("togglePosted")?.addEventListener("click", () => {
  if (selected?.stock) togglePosted(selected.stock);
});

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.postedByStock) return;
    postedMap = (typeof LotLinkerPosted !== "undefined" && LotLinkerPosted.asMap)
      ? LotLinkerPosted.asMap(changes.postedByStock.newValue)
      : (changes.postedByStock.newValue || {});
    renderList();
  });
}

$("fill").onclick = async () => {
  if (!selected) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("No active tab");
  if (!/facebook\.com/i.test(tab.url || "")) {
    return status("Open a facebook.com Marketplace create tab first");
  }
  try {
    const pack = await ensureResearched(selected);
    selected = pack;
    renderListing(pack);
    const res = await chrome.tabs.sendMessage(tab.id, { type: "LOT_LINKER_FILL", pack });
    if (res?.ok) {
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
    const remote = Array.isArray(data) ? data : (data.packs || []);
    if (!remote.length) {
      status("Refresh failed: no packs in remote JSON");
      return;
    }
    packs = remote;
    const at = new Date().toISOString();
    await chrome.storage.local.set({
      packsOverride: packs,
      packsRefreshedAt: at,
      packsSource: url,
      // postedByStock is intentionally not written — Refresh must not wipe marks
    });
    fillStoreFilter();
    renderList();
    if (selected) {
      const fresh = packs.find((p) => p.stock === selected.stock);
      showPack(fresh || null);
    }
    showRefreshMeta(at);
    status(`Refreshed ${packs.length} packs · ${new Date(at).toLocaleString()}`);
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
