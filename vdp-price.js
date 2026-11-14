/**
 * Lot Linker Fill — read the VDP "Total Sale Price" exactly as displayed.
 * Never invent a total by adding service/filing fees to another field.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerVdpPrice = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function money(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function extractJsonArrayAt(raw, keyIdx) {
    const start = raw.indexOf("[", keyIdx);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  function extractDprice(html) {
    const raw = String(html || "");
    const idx = raw.search(/"dprice"\s*:/);
    if (idx < 0) return [];
    const arr = extractJsonArrayAt(raw, idx);
    return Array.isArray(arr) ? arr : [];
  }

  function labeledTotal(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const byLabel = list.find((r) => /total sale price/i.test(String(r?.label || "")));
    if (byLabel) return { total: money(byLabel.value), source: "dprice-label", row: byLabel };
    return { total: 0, source: "", row: null };
  }

  function visibleTotal(html) {
    const raw = String(html || "");
    const valueThenLabel = raw.match(
      /price-summary__final-price-value[^>]*>\s*\$?([\d,]+)\s*<\/span>\s*<span[^>]*price-summary__final-price-label[^>]*>\s*Total Sale Price/i
    );
    if (valueThenLabel) return money(valueThenLabel[1]);
    const labelThenValue = raw.match(
      /price-summary__final-price-label[^>]*>\s*Total Sale Price[\s\S]{0,240}?price-summary__final-price-value[^>]*>\s*\$?([\d,]+)/i
    );
    if (labelThenValue) return money(labelThenValue[1]);
    const dtDd = raw.match(/<dt[^>]*>\s*Total Sale Price\s*<\/dt>\s*<dd[^>]*>\s*\$?([\d,]+)/i);
    if (dtDd) return money(dtDd[1]);
    return 0;
  }

  function jsonLdPriceIfTotalLabeled(html) {
    const raw = String(html || "");
    if (!/Total Sale Price/i.test(raw)) return 0;
    const m = raw.match(/"offers"\s*:\s*\{[^}]{0,400}?"price"\s*:\s*"?(\d+)/i);
    return m ? money(m[1]) : 0;
  }

  function askingFrom(html, rows) {
    const list = Array.isArray(rows) ? rows : [];
    const asking = list.find((r) => r?.typeClass === "askingPrice" || /^price$/i.test(String(r?.label || "")));
    if (asking) return money(asking.value);
    const vis = String(html || "").match(
      /price-summary__starting-price-value[^>]*>\s*\$?([\d,]+)/i
    );
    return vis ? money(vis[1]) : 0;
  }

  function feeFrom(rows, typeClass, labelRe) {
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find(
      (r) => r?.typeClass === typeClass || (labelRe && labelRe.test(String(r?.label || "")))
    );
    return hit ? money(hit.value) : 0;
  }

  function extractTotalSalePrice(html) {
    const raw = String(html || "");
    const rows = extractDprice(raw);
    const labeled = labeledTotal(rows);
    const visible = visibleTotal(raw);
    const jsonLd = jsonLdPriceIfTotalLabeled(raw);
    const asking = askingFrom(raw, rows);
    const serviceFee = feeFrom(rows, "documentFee", /service fee/i);
    const filingFee = feeFrom(rows, "deliveryFee", /filing fee/i);

    let total = 0;
    let source = "";
    if (visible) {
      total = visible;
      source = "vdp-visible";
    } else if (labeled.total) {
      total = labeled.total;
      source = "dprice-label";
    } else if (jsonLd) {
      total = jsonLd;
      source = "json-ld";
    }

    return {
      total,
      source,
      asking,
      serviceFee,
      filingFee,
      found: total > 0,
    };
  }

  function applyLiveTotal(pack, extracted) {
    const p = pack && typeof pack === "object" ? pack : {};
    const info = extracted && typeof extracted === "object" ? extracted : extractTotalSalePrice("");
    if (!info.found || !info.total) {
      return {
        ...p,
        price: "",
        totalSalePrice: "",
        priceMissing: true,
        priceSource: "missing",
        priceIncludesDealerFees: false,
      };
    }
    const next = {
      ...p,
      price: String(info.total),
      totalSalePrice: String(info.total),
      priceMissing: false,
      priceSource: info.source || "vdp-total",
      priceIncludesDealerFees: true,
    };
    if (info.asking) next.basePrice = String(info.asking);
    if (info.asking) next.askingPrice = String(info.asking);
    if (info.serviceFee) next.serviceFee = String(info.serviceFee);
    if (info.filingFee) next.filingFee = String(info.filingFee);
    return next;
  }

  function advertisedTotal(pack) {
    const p = pack && typeof pack === "object" ? pack : {};
    if (p.priceMissing === true || p.priceMissing === "true") return 0;
    const vdp = money(p.totalSalePrice);
    if (vdp) return vdp;
    if (p.priceSource && p.priceSource !== "missing" && p.priceSource !== "computed") {
      return money(p.price);
    }
    if (p.priceSource === "vdp-visible" || p.priceSource === "dprice-label" || p.priceSource === "json-ld" || p.priceSource === "vdp-total") {
      return money(p.price);
    }
    return money(p.totalSalePrice) || 0;
  }

  async function overlayLiveTotals(packs, {
    fetchFn,
    sleepFn,
    onProgress,
    gapMs = 300,
  } = {}) {
    const doFetch = fetchFn || (typeof fetch === "function" ? fetch : null);
    const wait = sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const rows = Array.isArray(packs) ? packs : [];
    const out = [];
    let found = 0;
    let missing = 0;
    for (let i = 0; i < rows.length; i++) {
      const pk = rows[i] || {};
      if (typeof onProgress === "function") onProgress({ i, total: rows.length, stock: pk.stock });
      if (!doFetch || !pk.vdpUrl) {
        out.push(applyLiveTotal(pk, { found: false, total: 0 }));
        missing += 1;
        continue;
      }
      try {
        const html = await doFetch(pk.vdpUrl);
        const extracted = extractTotalSalePrice(typeof html === "string" ? html : "");
        const next = applyLiveTotal(pk, extracted);
        if (next.priceMissing) missing += 1;
        else found += 1;
        out.push(next);
      } catch {
        out.push(applyLiveTotal(pk, { found: false, total: 0 }));
        missing += 1;
      }
      if (gapMs && i < rows.length - 1) await wait(gapMs);
    }
    return { packs: out, found, missing };
  }

  return {
    money,
    extractDprice,
    extractTotalSalePrice,
    applyLiveTotal,
    advertisedTotal,
    overlayLiveTotals,
  };
});
