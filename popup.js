let packs = [];
let selected = null;

const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t || ""; };

function showRefreshMeta(iso) {
  const el = $("refreshMeta");
  if (!el) return;
  if (!iso) {
    el.textContent = "";
    return;
  }
  try {
    const d = new Date(iso);
    el.textContent = `Last refreshed: ${d.toLocaleString()}`;
  } catch {
    el.textContent = `Last refreshed: ${iso}`;
  }
}

async function loadBundled() {
  const res = await fetch(chrome.runtime.getURL("packs.json"));
  const data = await res.json();
  const bundled = data.packs || [];
  const byStock = Object.fromEntries(bundled.map((p) => [p.stock, p]));
  const stored = await chrome.storage.local.get(["packsOverride", "packsRefreshedAt"]);
  if (stored.packsOverride?.length) {
    // Keep user/import bodies if present, but always restore photoUrls/vdpUrl from bundled
    packs = stored.packsOverride.map((p) => {
      const b = byStock[p.stock];
      if (!b) return p;
      return {
        ...p,
        photoUrls: (p.photoUrls && p.photoUrls.length ? p.photoUrls : b.photoUrls) || [],
        vdpUrl: p.vdpUrl || b.vdpUrl || "",
        odometerMiles: p.odometerMiles ?? b.odometerMiles,
        body: p.body || b.body,
      };
    });
  } else {
    packs = bundled;
  }
  rebuildFilterOptions();
  renderList();
  showRefreshMeta(stored.packsRefreshedAt);
}

function uniqueSorted(vals) {
  return [...new Set(vals.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true }));
}

function fillSelect(sel, values, allLabel, keepValue) {
  if (!sel) return;
  const prev = keepValue != null ? keepValue : sel.value;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = allLabel;
  sel.appendChild(opt0);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
  if (prev && values.includes(prev)) sel.value = prev;
  else sel.value = "";
}

function rebuildFilterOptions() {
  const store = $("fStore")?.value || "";
  const make = $("fMake")?.value || "";
  const model = $("fModel")?.value || "";
  // cascading universe
  let u = packs;
  if (store) u = u.filter((p) => (p.rooftop || "") === store);
  fillSelect($("fStore"), uniqueSorted(packs.map((p) => p.rooftop || "")), "All stores", store);
  let uMake = store ? packs.filter((p) => (p.rooftop || "") === store) : packs;
  fillSelect($("fMake"), uniqueSorted(uMake.map((p) => p.make || "")), "All makes", make);
  let uModel = uMake;
  if (make) uModel = uModel.filter((p) => (p.make || "") === make);
  fillSelect($("fModel"), uniqueSorted(uModel.map((p) => p.model || "")), "All models", model);
  let uStock = uModel;
  if (model) uStock = uStock.filter((p) => (p.model || "") === model);
  fillSelect($("fStock"), uniqueSorted(uStock.map((p) => p.stock || "")), "All stock #s", $("fStock")?.value || "");
}

function applyFilters() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const store = $("fStore")?.value || "";
  const make = $("fMake")?.value || "";
  const model = $("fModel")?.value || "";
  const stock = $("fStock")?.value || "";
  return packs.filter((p) => {
    if (store && (p.rooftop || "") !== store) return false;
    if (make && (p.make || "") !== make) return false;
    if (model && (p.model || "") !== model) return false;
    if (stock && (p.stock || "") !== stock) return false;
    if (!q) return true;
    const hay = [p.stock, p.vin, p.make, p.model, p.trim, p.title, p.condition, p.rooftop].join(" ").toLowerCase();
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
    opt.textContent = `${p.stock} · ${storeShort} · ${p.year} ${p.make} ${p.model} ${p.trim || ""} · $${Number(p.price || 0).toLocaleString()}`;
    list.appendChild(opt);
  }
  const withPhotos = packs.filter((p) => p.photoUrls?.length || p.vdpUrl).length;
  if (!filtered.length) status("No matches");
  else status(`${filtered.length} shown · ${packs.length} total · ${withPhotos} with photo source`);
  // keep selection if still visible
  if (selected && !filtered.some((p) => p.stock === selected.stock)) showPack(null);
}

function showPack(p) {
  selected = p;
  $("card").hidden = !p;
  const enable = !!p;
  ["fill", "copyTitle", "copyBody", "copyPrice", "downloadPhotos"].forEach((id) => ($(id).disabled = !enable));
  const n = p?.photoUrls?.length || 0;
  $("photoMeta").textContent = p
    ? (n ? `${n} cached photo URLs` : (p.vdpUrl ? "Photos via VDP fetch" : "No photo source"))
    : "";
  if (!p) return;
  $("mStock").textContent = p.stock;
  $("mTitle").textContent = p.title;
  $("mPrice").textContent = p.price ? `$${Number(p.price).toLocaleString()}` : "";
  $("mVin").textContent = p.vin || "";
  $("mMiles").textContent = p.mileage ?? "";
  $("mCond").textContent = p.condition || "";
  const intName = p.interiorName || p.interior || "";
  const intFb = p.interiorFb || "";
  $("mExt").textContent = p.exterior ? `${p.exterior}${p.exteriorFb ? " → "+p.exteriorFb : ""}` : "";
  $("mInt").textContent = intName ? `${intName}${intFb && intFb!==intName ? " → "+intFb : ""}` : "";
  $("mBody").textContent = p.body || "";
}

function parseEasyPaste(text) {
  const blocks = text.split(/\n### STOCK\s+/).slice(1);
  const out = [];
  for (const b of blocks) {
    const stock = b.split("\n", 1)[0].trim();
    const grab = (label) => {
      const m = b.match(new RegExp("\\*\\*" + label + " \\(paste\\):\\*\\*\\s*```\\s*([\\s\\S]*?)\\s*```"));
      return m ? m[1].trim() : "";
    };
    const filters = (b.match(/\*\*Filters:\*\*\s*(.+)/) || [,""])[1];
    const parts = filters.split("|").map((s) => s.trim());
    const p = (i, d = "") => (parts[i] != null ? parts[i] : d);
    let zip = (p(15, "53066") || "53066").replace(/^zip\s*/i, "").trim() || "53066";
    const priceRaw = grab("PRICE");
    out.push({
      stock,
      year: p(0), make: p(1), model: p(2), trim: p(3), bodyStyle: p(4),
      mileage: p(5), vin: p(6), condition: p(7), exterior: p(8), interior: p(9),
      transmission: p(10), fuel: p(11), drivetrain: p(12), titleStatus: p(13),
      zip, price: priceRaw.replace(/[^\d.]/g, ""), title: grab("TITLE"), body: grab("BODY"),
      rooftop: grab("BODY").includes("Hyundai") ? "Lake Country Hyundai" : "Lake Country Nissan",
    });
  }
  return out;
}

async function copyText(t) {
  await navigator.clipboard.writeText(t || "");
}

$("q").addEventListener("input", () => renderList());
["fStore", "fMake", "fModel", "fStock"].forEach((id) => {
  $(id)?.addEventListener("change", () => {
    if (id !== "fStock") rebuildFilterOptions();
    renderList();
  });
});
$("list").addEventListener("change", () => {
  const p = packs.find((x) => x.stock === $("list").value);
  showPack(p || null);
});

$("copyTitle").onclick = async () => { await copyText(selected?.title); status("Title copied"); };
$("copyBody").onclick = async () => { await copyText(selected?.body); status("Body copied"); };
$("copyPrice").onclick = async () => { await copyText(selected?.price); status("Price copied"); };

$("fill").onclick = async () => {
  if (!selected) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("No active tab");
  if (!/facebook\.com/i.test(tab.url || "")) {
    return status("Open a facebook.com Marketplace create tab first");
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "LOT_LINKER_FILL", pack: selected });
    if (res?.ok) status(`Filled: ${res.filled?.join(", ") || "ok"}${res.missed?.length ? ` · missed: ${res.missed.join(", ")}` : ""}${res.notes ? ` · ${res.notes}` : ""}`);
    else status(res?.error || "Fill failed — use Copy buttons");
  } catch (e) {
    status("Content script not ready — refresh the Facebook tab, then try again");
  }
};

$("importPaste").onclick = async () => {
  const text = $("importText").value;
  const parsed = parseEasyPaste(text);
  if (!parsed.length) return status("No STOCK blocks found");
  packs = parsed;
  await chrome.storage.local.set({ packsOverride: packs });
  rebuildFilterOptions();
  renderList();
  status(`Imported ${packs.length} packs`);
};

$("importFile").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  packs = data.packs || data;
  await chrome.storage.local.set({ packsOverride: packs });
  rebuildFilterOptions();
  renderList();
  status(`Loaded ${packs.length} from JSON`);
};


$("refreshInventory").onclick = async () => {
  const url = (typeof LOT_LINKER_PACKS_URL !== "undefined" && LOT_LINKER_PACKS_URL)
    ? LOT_LINKER_PACKS_URL
    : "https://raw.githubusercontent.com/Jedv9/lot-linker-fill/main/packs.json";
  status("Refreshing inventory from GitHub…");
  try {
    const res = await fetch(url + "?t=" + Date.now());
    if (!res.ok) {
      status(`Refresh failed: HTTP ${res.status}${res.status === 404 ? " (not found)" : ""}`);
      return;
    }
    let data;
    try {
      data = await res.json();
    } catch {
      status("Refresh failed: invalid JSON");
      return;
    }
    const remote = Array.isArray(data) ? data : (data.packs || []);
    if (!remote.length) {
      status("Refresh failed: no packs in remote JSON");
      return;
    }
    // Remote packs.json is source of truth — do not merge photoUrls from bundled
    packs = remote;
    const at = new Date().toISOString();
    await chrome.storage.local.set({
      packsOverride: packs,
      packsRefreshedAt: at,
      packsSource: url,
    });
    rebuildFilterOptions();
    renderList();
    showRefreshMeta(at);
    const when = new Date(at).toLocaleString();
    status(`Refreshed ${packs.length} packs from GitHub · ${when}`);
  } catch (e) {
    status(`Refresh failed: network error (${e?.message || e})`);
  }
};

loadBundled();


$("downloadPhotos").onclick = async () => {
  if (!selected) return;
  status("Downloading photos…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "LOT_LINKER_DOWNLOAD_PHOTOS", pack: selected });
    if (res?.ok) status(`Saved ${res.count} photos → ${res.folder}. ${res.hint || ""}`);
    else status(res?.error || "Photo download failed");
  } catch (e) {
    status(String(e));
  }
};
