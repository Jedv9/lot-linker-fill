/**
 * Lot Linker Fill — read the VDP "Total Sale Price" exactly as displayed.
 * Never invent a total by adding service/filing fees to another field.
 *
 * Live Dealer.com widget puts the Total Sale Price '$' in its own element/line
 * and the digits on the next (innerText: "$\n46,815"). Asking "Price" is one
 * piece ("$46,298"). Parsers must join text nodes and allow whitespace
 * between '$' and the number.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerVdpPrice = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SITE = "https://www.lexusofbrookfield.com";
  const DEALER_HOST_RE = /lexusofbrookfield\.com/i;
  const VDP_PATH_RE = /\/(certified|used|electric-certified|electric-used)\//i;

  function money(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function isDealerVehicleUrl(url) {
    const u = String(url || "");
    if (!DEALER_HOST_RE.test(u)) return false;
    return VDP_PATH_RE.test(u) || /\/(?:used-inventory|l-certified-inventory)\//i.test(u);
  }

  function dealerUrl(pathOrUrl) {
    const s = String(pathOrUrl || "").trim();
    if (!s) return "";
    if (/^https:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return `${SITE}${s}`;
    return "";
  }

  function detectChallenge(html, title) {
    const t = String(title || "");
    const h = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .slice(0, 16000);
    const blob = `${t}\n${h}`;
    if (
      /Access Denied|Reference #\d+\.\w+\.\w+|errors\.edgesuite|AkamaiGHost|Pardon Our Interruption|Attention Required|cf-browser-verification|You don't have permission to access/i.test(
        blob
      )
    ) {
      return "akamai-challenge";
    }
    if (h.trim().length < 240 && /403|forbidden/i.test(blob)) return "akamai-challenge";
    return "";
  }

  function stripTagsToText(chunk) {
    return String(chunk || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|dt|dd|li|h[1-6]|tr|span|td|th)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/g, " ")
      .replace(/&#36;/g, "$")
      .replace(/&amp;/g, "&")
      .replace(/\u00a0/g, " ");
  }

  function htmlToVisibleText(html) {
    return stripTagsToText(html).replace(/\r/g, "");
  }

  function moneyFromScattered(chunk) {
    const text = stripTagsToText(chunk);
    const collapsed = text.replace(/[ \t\f\v]+/g, " ");
    const withDollar = collapsed.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    if (withDollar) return money(withDollar[1]);
    const digits = collapsed.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/);
    return digits ? money(digits[1]) : 0;
  }

  function labeledMoneyFromText(text, label) {
    const t = String(text || "").replace(/\u00a0/g, " ");
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped + "\\s*\\$?\\s*([\\d,]+)", "i");
    const m = t.match(re);
    return m ? money(m[1]) : 0;
  }

  function askingFromText(text) {
    const lines = String(text || "")
      .replace(/\u00a0/g, " ")
      .split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^price$/i.test(line)) {
        const n = moneyFromScattered(lines.slice(i + 1, i + 4).join("\n"));
        if (n) return n;
      }
      const inline = line.match(/^price\s*:?\s*(\$\s*[\d,]+)/i);
      if (inline) return money(inline[1]);
    }
    return 0;
  }

  function extractJsonArrayAt(raw, keyIdx) {
    const start = raw.indexOf("[", keyIdx);
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "[") depth += 1;
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
    const quoted = raw.search(/"dprice"\s*:/);
    const bare = raw.search(/\bdprice\s*:/);
    const idx = quoted >= 0 ? quoted : bare;
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

  function walkForDprice(obj, depth) {
    if (!obj || depth > 10) return [];
    if (Array.isArray(obj)) {
      if (obj.some((x) => x && /total sale price/i.test(String(x.label || "")))) return obj;
      for (const x of obj) {
        const hit = walkForDprice(x, depth + 1);
        if (hit.length) return hit;
      }
      return [];
    }
    if (typeof obj !== "object") return [];
    if (Array.isArray(obj.dprice)) {
      const labeled = labeledTotal(obj.dprice);
      if (labeled.total) return obj.dprice;
    }
    for (const v of Object.values(obj)) {
      const hit = walkForDprice(v, (depth || 0) + 1);
      if (hit.length) return hit;
    }
    return [];
  }

  function looseLabeledTotal(html) {
    const raw = String(html || "");
    const patterns = [
      /label\s*:\s*["']Total Sale Price["'][\s\S]{0,200}?value\s*:\s*["']\$?\s*([\d,]+)/i,
      /value\s*:\s*["']\$?\s*([\d,]+)["'][\s\S]{0,200}?label\s*:\s*["']Total Sale Price["']/i,
      /"label"\s*:\s*"Total Sale Price"[\s\S]{0,200}?"value"\s*:\s*"\$?\s*([\d,]+)/i,
    ];
    for (const re of patterns) {
      const m = raw.match(re);
      if (m) return money(m[1]);
    }
    return 0;
  }

  function dtDdTotals(html) {
    const raw = String(html || "");
    const re = /<(dt|th)[^>]*>([\s\S]*?)<\/\1>\s*<(dd|td)[^>]*>([\s\S]*?)<\/\3>/gi;
    let total = 0;
    let asking = 0;
    let m;
    while ((m = re.exec(raw))) {
      const label = stripTagsToText(m[2]).replace(/\s+/g, " ").trim();
      const amount = moneyFromScattered(m[4]);
      if (/^total sale price$/i.test(label) && amount) total = amount;
      else if (/^price$/i.test(label) && amount) asking = asking || amount;
    }
    return { total, asking };
  }

  function visibleWidgetTotal(html) {
    const raw = String(html || "");
    const valueThenLabel = raw.match(
      /price-summary__final-price-value[^>]*>([\s\S]{0,80}?)<\/span>\s*<span[^>]*price-summary__final-price-label[^>]*>\s*Total Sale Price/i
    );
    if (valueThenLabel) {
      const n = moneyFromScattered(valueThenLabel[1]);
      if (n) return n;
    }
    const labelThenValue = raw.match(
      /price-summary__final-price-label[^>]*>\s*Total Sale Price[\s\S]{0,240}?price-summary__final-price-value[^>]*>([\s\S]{0,80}?)<\/span>/i
    );
    if (labelThenValue) {
      const n = moneyFromScattered(labelThenValue[1]);
      if (n) return n;
    }
    const box = raw.match(
      /price-summary__final-price[^>]*>([\s\S]{0,400}?)price-summary__final-price-label[^>]*>\s*Total Sale Price/i
    );
    if (box) {
      const n = moneyFromScattered(box[1]);
      if (n) return n;
    }
    return 0;
  }

  function dataAttrTotal(html) {
    const raw = String(html || "");
    const m =
      raw.match(/data-total-sale-price=["']\$?\s*([\d,]+)/i) ||
      raw.match(/data-final-price=["']\$?\s*([\d,]+)/i) ||
      raw.match(/data-internet-price=["']\$?\s*([\d,]+)/i);
    return m ? money(m[1]) : 0;
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
    const vis = String(html || "").match(/price-summary__starting-price-value[^>]*>([\s\S]{0,60}?)<\/span>/i);
    if (vis) {
      const n = moneyFromScattered(vis[1]);
      if (n) return n;
    }
    const dt = dtDdTotals(html);
    if (dt.asking) return dt.asking;
    return askingFromText(htmlToVisibleText(html));
  }

  function feeFrom(rows, typeClass, labelRe) {
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find(
      (r) => r?.typeClass === typeClass || (labelRe && labelRe.test(String(r?.label || "")))
    );
    return hit ? money(hit.value) : 0;
  }

  function emptyExtract(extra) {
    return {
      total: 0,
      source: "",
      asking: extra?.asking || 0,
      serviceFee: extra?.serviceFee || 0,
      filingFee: extra?.filingFee || 0,
      found: false,
      reason: extra?.reason || "no-total-sale-price",
      tried: extra?.tried || [],
      httpStatus: extra?.httpStatus || 0,
    };
  }

  function extractTotalSalePrice(html, extras) {
    const raw = String(html || "");
    const extra = extras && typeof extras === "object" ? extras : {};
    const tried = Array.isArray(extra.tried) ? extra.tried.slice() : [];
    const title = extra.title || "";
    const challenge = detectChallenge(raw, title);
    if (challenge) {
      return emptyExtract({ reason: challenge, tried: tried.concat(["challenge"]), httpStatus: extra.httpStatus });
    }
    if (!raw.trim()) {
      return emptyExtract({ reason: extra.httpStatus ? `http-${extra.httpStatus}` : "empty-html", tried: tried.concat(["empty"]), httpStatus: extra.httpStatus });
    }

    const ddcRows = extra.ddc ? walkForDprice(extra.ddc, 0) : [];
    const rows = ddcRows.length ? ddcRows : extractDprice(raw);
    const labeled = labeledTotal(rows);
    const widget = visibleWidgetTotal(raw);
    const dtDd = dtDdTotals(raw);
    const dataAttr = dataAttrTotal(raw);
    const innerText = extra.innerText || htmlToVisibleText(raw);
    const fromText = labeledMoneyFromText(innerText, "Total Sale Price");
    const loose = looseLabeledTotal(raw);
    const jsonLd = jsonLdPriceIfTotalLabeled(raw);
    const asking = extra.asking || askingFrom(raw, rows) || askingFromText(innerText);
    const serviceFee = feeFrom(rows, "documentFee", /service fee/i);
    const filingFee = feeFrom(rows, "deliveryFee", /filing fee/i);

    let total = 0;
    let source = "";
    const pick = (n, src, tag) => {
      tried.push(tag);
      if (!total && n) {
        total = n;
        source = src;
      }
    };

    pick(dtDd.total, "dom-dt-dd", "dt-dd");
    pick(widget, "vdp-visible", "price-summary");
    pick(dataAttr, "dom-data-attr", "data-attr");
    pick(fromText, "text-label", "inner-text");
    pick(labeled.total, "dprice-label", "dprice");
    pick(loose, "dprice-loose", "loose-js");
    pick(jsonLd, "json-ld", "json-ld");

    if (total) {
      return {
        total,
        source,
        asking,
        serviceFee,
        filingFee,
        found: true,
        reason: "",
        tried,
        httpStatus: extra.httpStatus || 0,
      };
    }

    let reason = "no-total-sale-price";
    if (asking) reason = "asking-only-no-total";
    if (extra.httpStatus && extra.httpStatus !== 200) reason = `http-${extra.httpStatus}`;
    return emptyExtract({ reason, asking, serviceFee, filingFee, tried, httpStatus: extra.httpStatus });
  }

  function siblingValueEl(el) {
    if (!el) return null;
    const next = el.nextElementSibling;
    if (next && /^(DD|TD|SPAN|DIV)$/i.test(next.tagName)) return next;
    const parent = el.parentElement;
    if (parent) {
      const dd = parent.querySelector("dd, td, [class*='value'], [class*='amount']");
      if (dd && dd !== el) return dd;
    }
    return parent;
  }

  function extractFromRenderedDom(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return { total: 0, asking: 0, source: "", found: false };
    }
    let total = 0;
    let asking = 0;
    let source = "";

    const labels = doc.querySelectorAll("dt, th, [class*='final-price-label'], [data-label]");
    for (const el of labels) {
      const label = String(el.getAttribute("data-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      const valueEl = siblingValueEl(el);
      const amount = moneyFromScattered(
        valueEl ? `${valueEl.innerHTML || ""}\n${valueEl.textContent || ""}` : el.textContent || ""
      );
      if (/^total sale price$/i.test(label) && amount) {
        total = amount;
        source = "dom-dt-dd";
      } else if (/^price$/i.test(label) && amount) {
        asking = asking || amount;
      }
    }

    const finalLabel = doc.querySelector(".price-summary__final-price-label, [class*='final-price-label']");
    const finalVal = doc.querySelector(".price-summary__final-price-value, [class*='final-price-value']");
    if (finalLabel && /total sale price/i.test(finalLabel.textContent || "") && finalVal) {
      const n = moneyFromScattered(`${finalVal.innerHTML || ""}\n${finalVal.textContent || ""}`);
      if (n) {
        total = n;
        source = "dom-price-summary";
      }
    }

    const boxes = doc.querySelectorAll(".price-summary__final-price, [class*='final-price']");
    for (const box of boxes) {
      if (!/total sale price/i.test(box.textContent || "")) continue;
      const val = box.querySelector(".price-summary__final-price-value, [class*='final-price-value']");
      const n = moneyFromScattered(val ? `${val.innerHTML || ""}\n${val.textContent || ""}` : box.innerHTML || "");
      if (n) {
        total = n;
        source = source || "dom-price-summary";
      }
    }

    const dataEl = doc.querySelector("[data-total-sale-price], [data-final-price], [data-internet-price]");
    if (dataEl) {
      const n = money(
        dataEl.getAttribute("data-total-sale-price") ||
          dataEl.getAttribute("data-final-price") ||
          dataEl.getAttribute("data-internet-price")
      );
      if (n) {
        total = n;
        source = source || "dom-data-attr";
      }
    }

    if (!total) {
      const innerText = doc.body ? doc.body.innerText || doc.body.textContent || "" : "";
      const n = labeledMoneyFromText(innerText, "Total Sale Price");
      if (n) {
        total = n;
        source = "dom-inner-text";
      }
      if (!asking) asking = askingFromText(innerText);
    }

    return { total, asking, source, found: total > 0 };
  }

  function extractFromDocument(doc, extras) {
    const extra = extras && typeof extras === "object" ? extras : {};
    const documentRef = doc || (typeof globalThis.document !== "undefined" ? globalThis.document : null);
    const html =
      extra.html ||
      (documentRef && documentRef.documentElement && documentRef.documentElement.outerHTML) ||
      "";
    const title = extra.title || (documentRef && documentRef.title) || "";
    const innerText =
      extra.innerText ||
      (documentRef && documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) ||
      "";
    const tried = ["document"];
    const fromDom = extractFromRenderedDom(documentRef);
    tried.push("dom-structured");
    if (fromDom.found) {
      const rest = extractTotalSalePrice(html, {
        ddc: extra.ddc,
        title,
        innerText,
        asking: fromDom.asking,
        tried,
        httpStatus: extra.httpStatus,
      });
      return {
        ...rest,
        total: fromDom.total,
        source: fromDom.source || rest.source,
        asking: fromDom.asking || rest.asking,
        found: true,
        reason: "",
        tried,
      };
    }
    return extractTotalSalePrice(html, {
      ddc: extra.ddc,
      title,
      innerText,
      asking: fromDom.asking,
      tried,
      httpStatus: extra.httpStatus,
    });
  }

  function applyLiveTotal(pack, extracted) {
    const p = pack && typeof pack === "object" ? pack : {};
    const info = extracted && typeof extracted === "object" ? extracted : extractTotalSalePrice("");
    if (!info.found || !info.total) {
      let reason = info.reason || "";
      if (!reason && info.asking) reason = "asking-only-no-total";
      if (!reason) reason = p.vdpUrl ? "no-total-sale-price" : "no-vdp-url";
      return {
        ...p,
        price: "",
        totalSalePrice: "",
        priceMissing: true,
        priceSource: "missing",
        priceIncludesDealerFees: false,
        priceMissingReason: reason,
        priceTried: info.tried || [],
      };
    }
    const next = {
      ...p,
      price: String(info.total),
      totalSalePrice: String(info.total),
      priceMissing: false,
      priceSource: info.source || "vdp-total",
      priceIncludesDealerFees: true,
      priceMissingReason: "",
      priceTried: info.tried || [],
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
    return money(p.totalSalePrice) || 0;
  }

  function missingReasonText(pack) {
    const p = pack && typeof pack === "object" ? pack : {};
    if (!p.priceMissing && advertisedTotal(p)) return "";
    const why = String(p.priceMissingReason || "").trim();
    const tried = Array.isArray(p.priceTried) && p.priceTried.length ? ` tried: ${p.priceTried.join(", ")}` : "";
    if (why) return `${why}${tried}`;
    return `no-total-sale-price${tried}`;
  }

  async function overlayLiveTotals(packs, {
    readFn,
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

    async function readOne(pk) {
      if (typeof readFn === "function") {
        try {
          const got = await readFn(pk);
          if (got && typeof got === "object" && ("found" in got || "total" in got || "reason" in got)) {
            return got;
          }
          if (typeof got === "string") return extractTotalSalePrice(got);
          if (got && typeof got.html === "string") {
            return extractTotalSalePrice(got.html, { httpStatus: got.status, title: got.title, ddc: got.ddc });
          }
          return { found: false, total: 0, reason: "no-response" };
        } catch (e) {
          return { found: false, total: 0, reason: e?.reason || "tab-error" };
        }
      }
      if (!doFetch || !pk.vdpUrl) {
        return { found: false, total: 0, reason: pk.vdpUrl ? "no-reader" : "no-vdp-url" };
      }
      try {
        const html = await doFetch(pk.vdpUrl);
        if (html && typeof html === "object") {
          if ("found" in html || "total" in html) return html;
          const status = html.status || html.httpStatus || 0;
          if (status === 403 || status === 401) {
            return { found: false, total: 0, reason: `http-${status}`, httpStatus: status, tried: ["fetch"] };
          }
          return extractTotalSalePrice(typeof html.html === "string" ? html.html : "", {
            httpStatus: status,
            title: html.title,
            ddc: html.ddc,
          });
        }
        return extractTotalSalePrice(typeof html === "string" ? html : "");
      } catch (e) {
        return { found: false, total: 0, reason: e?.reason || "fetch-error" };
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const pk = rows[i] || {};
      if (typeof onProgress === "function") onProgress({ i, total: rows.length, stock: pk.stock });
      const extracted = await readOne(pk);
      const next = applyLiveTotal(pk, extracted);
      if (next.priceMissing) missing += 1;
      else found += 1;
      out.push(next);
      if (gapMs && i < rows.length - 1) await wait(gapMs);
    }
    return { packs: out, found, missing };
  }

  return {
    SITE,
    money,
    moneyFromScattered,
    htmlToVisibleText,
    labeledMoneyFromText,
    askingFromText,
    detectChallenge,
    extractDprice,
    extractTotalSalePrice,
    extractFromDocument,
    extractFromRenderedDom,
    applyLiveTotal,
    advertisedTotal,
    missingReasonText,
    overlayLiveTotals,
    isDealerVehicleUrl,
    dealerUrl,
    walkForDprice,
  };
});
