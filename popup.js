let packs = [];
let selected = null;
let researchPromise = null;
let researchStock = null;

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
  const stored = await chrome.storage.local.get(["packsOverride", "packsRefreshedAt"]);
  packs = stored.packsOverride?.length ? stored.packsOverride : bundled;
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

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const filtered = applyFilters();
  for (const p of filtered) {
    const opt = document.createElement("option");
    opt.value = p.stock;
    const storeShort = (p.rooftop || "").includes("Hyundai") ? "HY" : "NI";
    opt.textContent = `${p.stock} · ${storeShort} · ${p.year} ${p.make} ${p.model} ${p.trim || ""}`.trim();
    list.appendChild(opt);
  }
  if (!filtered.length) status("No matches");
  else status(`${filtered.length} shown · ${packs.length} total`);
  if (selected && !filtered.some((p) => p.stock === selected.stock)) showPack(null);
}

function renderListing(pack) {
  const listing = listingFor(pack);
  $("mTitle").textContent = listing.modelLine || listing.title;
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

loadBundled();
