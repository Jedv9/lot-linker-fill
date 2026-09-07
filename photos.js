/**
 * Lot Linker Fill — resolve VDP / pack photo URLs, strip Boucher red banner.
 * Works in the extension (service worker / content script / popup) and in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerPhotos = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_PHOTOS = 20;
  const FETCH_CONCURRENCY = 4;

  const PHOTO_HOST_RE =
    /https:\/\/(?:vehicle-images\.carscommerce\.inc|[^\s"'<>]*\.carscommerce\.inc|pictures\.dealer\.com|images\.dealer\.com|imagescdn\.dealercarsearch\.com)\/[^\s"'<>]+/gi;

  const EXT_RE = /\.(webp|jpe?g|png)(?:$|\?)/i;
  const SKIP_RE = /\/thumbnails?\/|\/icon|\/logo|\/sprite|1x1\.|pixel\.|placeholder/i;

  function text(v) {
    return String(v == null ? "" : v).trim();
  }

  function normalizeUrl(url) {
    return String(url || "").split("#")[0];
  }

  function looksLikePhotoUrl(url) {
    const u = normalizeUrl(url);
    if (/^blob:/i.test(u) || /^data:image\//i.test(u)) return true;
    if (!/^https:\/\//i.test(u)) return false;
    if (!EXT_RE.test(u)) return false;
    if (SKIP_RE.test(u)) return false;
    return (
      /vehicle-images\.carscommerce\.inc/i.test(u) ||
      /carscommerce\.inc/i.test(u) ||
      /pictures\.dealer\.com/i.test(u) ||
      /images\.dealer\.com/i.test(u) ||
      /imagescdn\.dealercarsearch\.com/i.test(u)
    );
  }

  function extractPhotoUrls(html) {
    const urls = [];
    const seen = new Set();
    const add = (raw) => {
      const u = normalizeUrl(raw).replace(/&amp;/g, "&");
      if (!looksLikePhotoUrl(u)) return;
      if (seen.has(u)) return;
      seen.add(u);
      urls.push(u);
    };

    const raw = String(html || "");
    PHOTO_HOST_RE.lastIndex = 0;
    let m;
    while ((m = PHOTO_HOST_RE.exec(raw))) {
      const u = m[0].replace(/[),.;]+$/, "");
      if (EXT_RE.test(u)) add(u);
      if (urls.length >= MAX_PHOTOS) return urls;
    }

    const jsonRe =
      /"(?:photoUrls|photo_urls|images|imageUrls|image_urls|photos)"\s*:\s*\[(.*?)\]/gis;
    let jm;
    while ((jm = jsonRe.exec(raw))) {
      for (const hit of jm[1].matchAll(/https?:\/\/[^"\\]+/g)) add(hit[0]);
      if (urls.length >= MAX_PHOTOS) return urls.slice(0, MAX_PHOTOS);
    }

    return urls.slice(0, MAX_PHOTOS);
  }

  async function resolvePhotoUrls(pack, { fetchFn } = {}) {
    const p = pack || {};
    const cached = (Array.isArray(p.photoUrls) ? p.photoUrls : []).map(text).filter(looksLikePhotoUrl);
    let fromVdp = [];
    const doFetch = fetchFn || (typeof fetch === "function" ? fetch : null);
    if (p.vdpUrl && doFetch) {
      try {
        const res = await doFetch(p.vdpUrl, { credentials: "omit", cache: "no-cache", referrerPolicy: "no-referrer" });
        if (res && res.ok) fromVdp = extractPhotoUrls(await res.text());
      } catch {
        /* pack cache is enough */
      }
    }

    const merged = [];
    const seen = new Set();
    for (const u of [...fromVdp, ...cached]) {
      if (seen.has(u)) continue;
      seen.add(u);
      merged.push(u);
      if (merged.length >= MAX_PHOTOS) break;
    }
    return {
      urls: merged,
      source: fromVdp.length ? "vdp" : cached.length ? "pack" : "",
      cached: cached.length,
      vdp: fromVdp.length,
    };
  }

  function hasPhotoSource(pack) {
    const p = pack || {};
    return Boolean((Array.isArray(p.photoUrls) && p.photoUrls.length) || p.vdpUrl);
  }

  async function stripBoucherBanner(blob) {
    if (typeof createImageBitmap !== "function") return blob;
    const bmp = await createImageBitmap(blob);
    try {
      const w = bmp.width;
      const h = bmp.height;
      const CanvasCtor = typeof OffscreenCanvas === "function" ? OffscreenCanvas : null;
      if (!CanvasCtor) return blob;
      const canvas = new CanvasCtor(w, h);
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
      const out = new CanvasCtor(w, outH);
      out.getContext("2d").drawImage(canvas, 0, 0, w, outH, 0, 0, w, outH);
      if (typeof out.convertToBlob === "function") {
        return await out.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      }
      return await new Promise((resolve, reject) => {
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92);
      });
    } finally {
      bmp.close?.();
    }
  }

  async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    });
    await Promise.all(workers);
    return out;
  }

  function stockSlug(pack) {
    return String(pack?.stock || "unit").replace(/[^\w.-]/g, "_") || "unit";
  }

  function fileNameFor(url, index, stock, forceJpg) {
    const extMatch = String(url).match(/\.(webp|jpe?g|png)(?:$|\?)/i);
    let ext = (extMatch?.[1] || "jpg").toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (forceJpg) ext = "jpg";
    return `${stock}-${String(index + 1).padStart(2, "0")}.${ext}`;
  }

  async function fetchOneBlob(url, { fetchFn, strip }) {
    const doFetch = fetchFn || fetch;
    const res = await doFetch(url, { credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer" });
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status || "?"}`);
    const raw = await res.blob();
    if (!strip) return { blob: raw, stripped: false };
    try {
      const stripped = await stripBoucherBanner(raw);
      return { blob: stripped, stripped: stripped !== raw };
    } catch {
      return { blob: raw, stripped: false };
    }
  }

  async function blobToBase64(blob) {
    if (typeof FileReader === "function") {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const s = String(fr.result || "");
          const i = s.indexOf(",");
          resolve(i >= 0 ? s.slice(i + 1) : s);
        };
        fr.onerror = () => reject(fr.error || new Error("FileReader failed"));
        fr.readAsDataURL(blob);
      });
    }
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function bytesFromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function filesFromTransfer(payloads) {
    return (payloads || []).map((p) => {
      const bytes = bytesFromBase64(p.base64);
      return new File([bytes], p.name, { type: p.type || "image/jpeg" });
    });
  }

  async function fetchPhotoRecords(pack, { fetchFn, strip = true } = {}) {
    const resolved = await resolvePhotoUrls(pack, { fetchFn });
    if (!resolved.urls.length) {
      return { ok: false, files: [], records: [], wanted: 0, stripped: 0, source: resolved.source, error: "No photo URLs on pack or VDP" };
    }
    const stock = stockSlug(pack);
    const rows = await mapPool(resolved.urls, FETCH_CONCURRENCY, async (url, idx) => {
      try {
        const { blob, stripped } = await fetchOneBlob(url, { fetchFn, strip });
        const name = fileNameFor(url, idx, stock, stripped);
        const type = stripped || /jpe?g/i.test(name) ? "image/jpeg" : blob.type || "image/jpeg";
        return { ok: true, blob, name, type, stripped, url };
      } catch (e) {
        return { ok: false, error: String(e?.message || e), url };
      }
    });
    const good = rows.filter((r) => r?.ok);
    return {
      ok: good.length > 0,
      records: good,
      wanted: resolved.urls.length,
      stripped: good.filter((r) => r.stripped).length,
      source: resolved.source,
      error: good.length ? "" : rows.find((r) => r && !r.ok)?.error || "Could not fetch photos",
      missedUrls: rows.filter((r) => r && !r.ok).length,
    };
  }

  async function fetchPhotoFiles(pack, opts) {
    const got = await fetchPhotoRecords(pack, opts);
    const FileCtor = typeof File === "function" ? File : null;
    const files = FileCtor
      ? got.records.map((r) => new FileCtor([r.blob], r.name, { type: r.type }))
      : [];
    return { ...got, files };
  }

  async function prepareTransfer(pack, opts) {
    const got = await fetchPhotoRecords(pack, opts);
    const files = [];
    for (const r of got.records) {
      files.push({
        name: r.name,
        type: r.type,
        base64: await blobToBase64(r.blob),
      });
    }
    return {
      ok: files.length > 0,
      files,
      wanted: got.wanted,
      stripped: got.stripped,
      source: got.source,
      error: got.error,
      missedUrls: got.missedUrls,
    };
  }

  return {
    MAX_PHOTOS,
    extractPhotoUrls,
    resolvePhotoUrls,
    hasPhotoSource,
    stripBoucherBanner,
    fetchPhotoFiles,
    fetchPhotoRecords,
    prepareTransfer,
    filesFromTransfer,
    looksLikePhotoUrl,
  };
});
