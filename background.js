function extractPhotoUrls(html) {
  const urls = [];
  const seen = new Set();
  const re = /https:\/\/vehicle-images\.carscommerce\.inc\/[^"'\s<>]+?\.(?:webp|jpg|jpeg|png)/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[0];
    if (u.includes("/thumbnails/")) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
    if (urls.length >= 20) break;
  }
  return urls;
}

async function resolvePhotoUrls(pack) {
  if (Array.isArray(pack.photoUrls) && pack.photoUrls.length) {
    return pack.photoUrls.slice(0, 20);
  }
  if (!pack.vdpUrl) return [];
  const res = await fetch(pack.vdpUrl, { credentials: "omit", cache: "no-cache" });
  if (!res.ok) throw new Error(`VDP page fetch failed (${res.status})`);
  const html = await res.text();
  const urls = extractPhotoUrls(html);
  if (!urls.length) throw new Error("No vehicle images found on VDP page");
  return urls;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("FileReader failed"));
    fr.readAsDataURL(blob);
  });
}

/** Strip Boucher red/bottom watermark. Keep top ~82%. */
async function stripBoucherBanner(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    const fallbackCut = Math.floor(h * 0.8203125);
    let cut = h;
    const scanFloor = Math.floor(h * 0.72);
    for (let y = h - 1; y >= scanFloor; y--) {
      let redish = 0;
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const i = row + x * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if ((r > 140 && g < 100 && b < 100) || (r > 120 && r > g * 1.4 && r > b * 1.4)) {
          redish++;
        }
      }
      if (redish / w > 0.1) cut = y;
      else if (cut < h) break;
    }
    if (cut > fallbackCut) cut = fallbackCut;
    if (cut < Math.floor(h * 0.7)) cut = fallbackCut;

    const outH = Math.max(1, cut);
    const out = new OffscreenCanvas(w, outH);
    out.getContext("2d").drawImage(canvas, 0, 0, w, outH, 0, 0, w, outH);
    return await out.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  } finally {
    bmp.close?.();
  }
}

async function downloadOne(url, filename, { strip }) {
  // Prefer fetch+optional strip+data URL. Fall back to direct CDN download.
  try {
    const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.blob();
    let outBlob = raw;
    let useName = filename;
    if (strip) {
      try {
        outBlob = await stripBoucherBanner(raw);
        useName = filename.replace(/\.(webp|png)$/i, ".jpg");
        if (!/\.jpe?g$/i.test(useName)) useName = useName.replace(/\.[^.]+$/, "") + ".jpg";
      } catch (e) {
        // keep original bytes if strip fails
        console.warn("strip failed, saving original", e);
      }
    }
    const dataUrl = await blobToDataUrl(outBlob);
    await chrome.downloads.download({
      url: dataUrl,
      filename: useName,
      conflictAction: "uniquify",
      saveAs: false,
    });
    return { ok: true, stripped: strip && outBlob !== raw };
  } catch (e) {
    // Last resort: let Chrome download the CDN URL directly (banner may remain)
    await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    return { ok: true, stripped: false, fallback: String(e) };
  }
}

async function downloadPhotos(pack) {
  let urls;
  try {
    urls = await resolvePhotoUrls(pack);
  } catch (e) {
    return {
      ok: false,
      error: `No photos for this stock: ${e.message || e}. Try a stock with cached photos (e.g. 26NU0143) or re-Load unpacked v1.4+.`,
    };
  }
  if (!urls.length) {
    return {
      ok: false,
      error: "No photo URLs on this pack. Refresh extension / Load unpacked so packs.json includes photoUrls.",
    };
  }

  const stock = String(pack.stock || "unit").replace(/[^\w.-]/g, "_");
  const folder = `LotLinkerPhotos/${stock}`;
  let n = 0;
  let stripped = 0;
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = (url.match(/\.(webp|jpg|jpeg|png)(?:\?|$)/i) || [, "jpg"])[1].toLowerCase();
    const filename = `${folder}/${String(i + 1).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
    try {
      const r = await downloadOne(url, filename, { strip: true });
      if (r.ok) {
        n++;
        if (r.stripped) stripped++;
      }
    } catch (e) {
      errors.push(`${i + 1}: ${e.message || e}`);
    }
  }

  if (!n) {
    return {
      ok: false,
      error: `Could not download any photos. ${errors.slice(0, 2).join(" | ") || "Unknown error — check chrome://extensions errors for Lot Linker Fill."}`,
    };
  }
  return {
    ok: true,
    count: n,
    stripped,
    folder: `Downloads/${folder}`,
    hint:
      stripped > 0
        ? "Boucher red banner stripped. Drag those JPGs into Marketplace."
        : "Photos saved (banner strip skipped on some). Drag into Marketplace.",
    errors: errors.slice(0, 3),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "LOT_LINKER_DOWNLOAD_PHOTOS") return;
  downloadPhotos(msg.pack || {})
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
