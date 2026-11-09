/**
 * Lot Linker Fill — sold / gone-from-lot tracking.
 * Works in the extension (popup / service worker) and in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerSold = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const KEEP_DAYS = 60;
  const CURRENT_DEALER_RE = /lexus of brookfield|lexusofbrookfield/i;

  function text(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function stockKey(p) {
    return text(p && typeof p === "object" ? p.stock : p).toUpperCase();
  }

  function vinLast6(vin) {
    const s = text(vin).replace(/[^A-Za-z0-9]/g, "");
    return s.length >= 6 ? s.slice(-6).toUpperCase() : "";
  }

  function formatMoney(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n.toLocaleString("en-US") : "";
  }

  function isCurrentDealer(p) {
    const hay = [p?.rooftop, p?.vdpUrl].map(text).filter(Boolean).join(" ");
    if (!hay) return true;
    return CURRENT_DEALER_RE.test(hay);
  }

  function packSummary(pack) {
    const p = pack && typeof pack === "object" ? pack : {};
    return {
      stock: text(p.stock),
      vin: text(p.vin),
      year: text(p.year),
      make: text(p.make),
      model: text(p.model),
      trim: text(p.trim),
      price: text(p.price || p.lastPrice),
      rooftop: text(p.rooftop),
      vdpUrl: text(p.vdpUrl),
      condition: text(p.condition),
    };
  }

  function soldRowFromPack(pack, detectedAt) {
    const p = pack && typeof pack === "object" ? pack : {};
    const year = text(p.year);
    const make = text(p.make);
    const model = text(p.model);
    const trim = text(p.trim);
    const vehicle = text(p.vehicle) || [year, make, model, trim].filter(Boolean).join(" ");
    return {
      stock: text(p.stock),
      vin: text(p.vin),
      year,
      make,
      model,
      trim,
      vehicle,
      lastPrice: text(p.lastPrice || p.price),
      rooftop: text(p.rooftop),
      detectedAt: text(p.detectedAt || detectedAt),
    };
  }

  function isTrustedComplete({ complete, expectedTotal, nextCount, previousCount = 0 } = {}) {
    const n = Number(nextCount) || 0;
    if (!n) return false;
    if (complete === false || complete === "false") return false;
    const expected = Number(expectedTotal) || 0;
    if (expected > 0 && n < expected) return false;
    if (complete !== true && complete !== "true") {
      const prev = Number(previousCount) || 0;
      if (prev > 0 && n < Math.ceil(prev * 0.5)) return false;
    }
    return true;
  }

  function detectSold({
    previousPacks = [],
    nextPacks = [],
    complete,
    expectedTotal,
    now,
  } = {}) {
    const previous = Array.isArray(previousPacks) ? previousPacks : [];
    const next = Array.isArray(nextPacks) ? nextPacks : [];
    const detectedAt = text(now) || new Date().toISOString();
    if (!isTrustedComplete({
      complete,
      expectedTotal,
      nextCount: next.length,
      previousCount: previous.length,
    })) {
      return { sold: [], skipped: "incomplete" };
    }
    const live = new Set(next.map(stockKey).filter(Boolean));
    const sold = [];
    const seen = new Set();
    for (const p of previous) {
      const k = stockKey(p);
      if (!k || live.has(k) || seen.has(k)) continue;
      if (!isCurrentDealer(p)) continue;
      if (text(p.condition).toUpperCase() === "NEW") continue;
      seen.add(k);
      sold.push(soldRowFromPack(p, detectedAt));
    }
    return { sold, skipped: "" };
  }

  function mergeSoldHistory(previousHistory, newSold, {
    now,
    keepDays = KEEP_DAYS,
    liveStocks = [],
  } = {}) {
    const detectedAt = text(now) || new Date().toISOString();
    const cutoff = Date.parse(detectedAt) - Number(keepDays) * 86400000;
    const live = new Set((liveStocks || []).map(stockKey).filter(Boolean));
    const by = new Map();

    const consider = (row, fallbackAt) => {
      const rec = soldRowFromPack(row, text(row?.detectedAt) || fallbackAt);
      const k = stockKey(rec);
      if (!k || live.has(k) || !isCurrentDealer(rec)) return;
      const ts = Date.parse(rec.detectedAt || detectedAt);
      if (Number.isFinite(ts) && Number.isFinite(cutoff) && ts < cutoff) return;
      const prev = by.get(k);
      if (!prev) {
        by.set(k, rec);
        return;
      }
      const prevTs = Date.parse(prev.detectedAt || detectedAt);
      const recTs = Date.parse(rec.detectedAt || detectedAt);
      const earlier = Number.isFinite(recTs) && Number.isFinite(prevTs) && recTs < prevTs ? rec : prev;
      const later = earlier === rec ? prev : rec;
      by.set(k, {
        ...later,
        ...earlier,
        detectedAt: earlier.detectedAt || later.detectedAt,
        lastPrice: later.lastPrice || earlier.lastPrice,
      });
    };

    for (const row of previousHistory || []) consider(row, row?.detectedAt || detectedAt);
    for (const row of newSold || []) consider(row, row?.detectedAt || detectedAt);
    return [...by.values()].sort((a, b) => text(b.detectedAt).localeCompare(text(a.detectedAt)));
  }

  function buildSoldSnapshot({
    previousPacks = [],
    nextPacks = [],
    previousHistory = [],
    now,
    keepDays = KEEP_DAYS,
    complete,
    expectedTotal,
  } = {}) {
    const detectedAt = text(now) || new Date().toISOString();
    const detected = detectSold({
      previousPacks,
      nextPacks,
      complete,
      expectedTotal,
      now: detectedAt,
    });
    const liveStocks = (nextPacks || []).map((p) => p?.stock).filter(Boolean);
    const incoming = detected.skipped ? [] : detected.sold;
    const soldHistory = mergeSoldHistory(previousHistory, incoming, {
      now: detectedAt,
      keepDays,
      liveStocks,
    });
    return {
      sold: detected.sold,
      soldSinceLast: detected.sold.length,
      soldHistory,
      skipped: detected.skipped,
    };
  }

  function rowsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    const history = Array.isArray(payload.soldHistory) ? payload.soldHistory : [];
    const sold = Array.isArray(payload.sold) ? payload.sold : [];
    return [...history, ...sold];
  }

  function dismissedSet(dismissed) {
    if (Array.isArray(dismissed)) {
      return new Set(dismissed.map((s) => text(s).toUpperCase()).filter(Boolean));
    }
    if (dismissed && typeof dismissed === "object") {
      return new Set(Object.keys(dismissed).map((s) => text(s).toUpperCase()).filter(Boolean));
    }
    return new Set();
  }

  function markDismissed(dismissed, stock, at) {
    const next = {};
    if (Array.isArray(dismissed)) {
      for (const s of dismissed) {
        if (text(s)) next[text(s)] = at;
      }
    } else if (dismissed && typeof dismissed === "object") {
      Object.assign(next, dismissed);
    }
    const key = text(stock);
    if (key) next[key] = text(at) || new Date().toISOString();
    return next;
  }

  function pruneDismissed(dismissed, liveStocks) {
    const live = new Set((liveStocks || []).map(stockKey).filter(Boolean));
    const next = {};
    const src = Array.isArray(dismissed)
      ? Object.fromEntries(dismissed.map((s) => [s, true]))
      : (dismissed && typeof dismissed === "object" ? dismissed : {});
    for (const [key, val] of Object.entries(src)) {
      if (live.has(text(key).toUpperCase())) continue;
      next[key] = val;
    }
    return next;
  }

  function undismissedSold(rows, dismissed) {
    const gone = dismissedSet(dismissed);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const k = stockKey(row);
      return k && !gone.has(k);
    });
  }

  function undismissedCount(rows, dismissed) {
    return undismissedSold(rows, dismissed).length;
  }

  function badgeText(count) {
    const n = Number(count) || 0;
    if (n <= 0) return "";
    if (n > 99) return "99+";
    return String(n);
  }

  function listedSet(listed) {
    if (Array.isArray(listed)) {
      return new Set(listed.map((s) => text(s).toUpperCase()).filter(Boolean));
    }
    if (listed && typeof listed === "object") {
      return new Set(
        Object.entries(listed)
          .filter(([, on]) => on)
          .map(([s]) => text(s).toUpperCase())
          .filter(Boolean)
      );
    }
    return new Set();
  }

  function toggleListed(listed, stock, on) {
    const next = {};
    if (Array.isArray(listed)) {
      for (const s of listed) {
        if (text(s)) next[text(s)] = true;
      }
    } else if (listed && typeof listed === "object") {
      Object.assign(next, listed);
    }
    const key = text(stock);
    if (!key) return next;
    if (on) next[key] = true;
    else delete next[key];
    return next;
  }

  function isListed(listed, stock) {
    return listedSet(listed).has(text(stock).toUpperCase());
  }

  function sortSoldForDisplay(rows, listed) {
    const flagged = listedSet(listed);
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
      const aListed = flagged.has(stockKey(a)) ? 0 : 1;
      const bListed = flagged.has(stockKey(b)) ? 0 : 1;
      if (aListed !== bListed) return aListed - bListed;
      return text(b.detectedAt).localeCompare(text(a.detectedAt));
    });
  }

  function soldHeadline(row) {
    return text(row?.vehicle) || [row?.year, row?.make, row?.model, row?.trim].map(text).filter(Boolean).join(" ");
  }

  function soldMeta(row) {
    const bits = [];
    if (text(row?.stock)) bits.push(`Stock ${text(row.stock)}`);
    const last6 = vinLast6(row?.vin);
    if (last6) bits.push(`VIN …${last6}`);
    const price = formatMoney(row?.lastPrice);
    if (price) bits.push(`$${price}`);
    return bits.join(" · ");
  }

  function soldDateLabel(row) {
    const ts = Date.parse(row?.detectedAt);
    if (!Number.isFinite(ts)) return "";
    try {
      return `Gone ${new Date(ts).toLocaleDateString()}`;
    } catch {
      return `Gone ${text(row.detectedAt)}`;
    }
  }

  function mergeWatchFromRefresh({
    existing = [],
    payload,
    previousPacks = [],
    nextPacks = [],
    now,
    keepDays = KEEP_DAYS,
  } = {}) {
    const detectedAt = text(now) || new Date().toISOString();
    const detected = detectSold({
      previousPacks,
      nextPacks,
      complete: payload?.complete,
      expectedTotal: payload?.expectedTotal,
      now: detectedAt,
    });
    const incoming = [
      ...rowsFromPayload(payload),
      ...(detected.skipped ? [] : detected.sold),
    ];
    const liveStocks = (nextPacks || []).map((p) => p?.stock).filter(Boolean);
    return {
      soldWatch: mergeSoldHistory(existing, incoming, {
        now: detectedAt,
        keepDays,
        liveStocks,
      }),
      detected: detected.sold,
      skipped: detected.skipped,
    };
  }

  return {
    KEEP_DAYS,
    stockKey,
    vinLast6,
    formatMoney,
    packSummary,
    soldRowFromPack,
    isTrustedComplete,
    detectSold,
    mergeSoldHistory,
    buildSoldSnapshot,
    rowsFromPayload,
    markDismissed,
    pruneDismissed,
    undismissedSold,
    undismissedCount,
    badgeText,
    listedSet,
    toggleListed,
    isListed,
    sortSoldForDisplay,
    soldHeadline,
    soldMeta,
    soldDateLabel,
    mergeWatchFromRefresh,
  };
});
