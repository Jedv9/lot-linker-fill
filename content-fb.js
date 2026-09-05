// Lot Linker Fill — Model + description only. Never Post. Never Year/Make/Mileage.
function isMarketplacePath() {
  return /marketplace/i.test(location.pathname + location.href);
}

function setNativeValue(el, value) {
  if (!el || value == null) return false;
  const next = String(value);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc =
    Object.getOwnPropertyDescriptor(proto, "value") ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const last = el.value;
  try {
    el._valueTracker?.setValue(last);
  } catch {
    /* ignore */
  }
  desc?.set?.call(el, next);
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, composed: true, data: next, inputType: "insertFromPaste" })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return String(el.value ?? "").replace(/\r\n/g, "\n") === next.replace(/\r\n/g, "\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fillMultiline(el, value) {
  const text = String(value);
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    if (setNativeValue(el, text)) return true;
  }
  el.focus();
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand("insertText", false, text)) {
      el.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text })
      );
      return true;
    }
  } catch {
    /* fall through */
  }
  el.innerHTML = text.split("\n").map((line) => (line ? escapeHtml(line) : "")).join("<br>");
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

function shortText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isControl(node) {
  return node?.matches?.(
    "input, textarea, select, [contenteditable], [role=textbox], [role=combobox]"
  );
}

function labelText(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.placeholder,
    el.name,
    el.id,
  ];
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const n = document.getElementById(id);
      if (n) bits.push(n.textContent);
    }
  }
  if (el.id) {
    try {
      const forLab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLab) bits.push(forLab.textContent);
    } catch {
      /* ignore */
    }
  }
  const closestLabel = el.closest("label");
  if (closestLabel) bits.push(closestLabel.textContent);

  const sib = el.previousElementSibling;
  if (sib && sib.matches("label, span, div, p, legend") && !isControl(sib) && !sib.querySelector("input, textarea, [contenteditable], [role=textbox]")) {
    const t = shortText(sib.textContent);
    if (t && t.length < 40) bits.push(t);
  }

  const parent = el.parentElement;
  if (parent) {
    const lab = parent.querySelector(":scope > label, :scope > span, :scope > [role=label]");
    if (lab && !lab.contains(el) && !lab.querySelector("input, textarea, [role=textbox]")) {
      const t = shortText(lab.textContent);
      if (t && t.length < 40) bits.push(t);
    }
    const gp = parent.parentElement;
    if (gp && gp.querySelectorAll("input, textarea, [contenteditable], [role=textbox]").length <= 1) {
      const glab = gp.querySelector(":scope > label, :scope > span, :scope > [role=label]");
      if (glab && !glab.contains(el)) {
        const t = shortText(glab.textContent);
        if (t && t.length < 40) bits.push(t);
      }
    }
  }
  return bits.filter(Boolean).map(shortText).filter(Boolean).join(" ").toLowerCase();
}

function isProtectedLabel(lab) {
  return (
    /\byear\b/.test(lab) ||
    /\bmake\b/.test(lab) ||
    /\bmileage\b/.test(lab) ||
    /\bodometer\b/.test(lab)
  );
}

function allInputs() {
  return [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]), textarea, [contenteditable]:not([contenteditable=false]), [role=textbox]"
    ),
  ];
}

function isMultilineEl(el) {
  return (
    el instanceof HTMLTextAreaElement ||
    el.isContentEditable ||
    el.getAttribute("aria-multiline") === "true" ||
    (el.getAttribute("role") === "textbox" && !(el instanceof HTMLInputElement))
  );
}

function findField(matchers, { exclude = [], prefer } = {}) {
  const hits = [];
  for (const el of allInputs()) {
    const lab = labelText(el);
    if (!lab) continue;
    if (isProtectedLabel(lab)) continue;
    if (exclude.some((x) => x.test(lab))) continue;
    if (!matchers.some((m) => m.test(lab))) continue;
    hits.push({ el, lab });
  }
  if (!hits.length) return null;
  if (prefer === "multiline") {
    const multi = hits.find((h) => isMultilineEl(h.el));
    if (multi) return multi.el;
  }
  if (prefer === "single") {
    const single = hits.find((h) => h.el instanceof HTMLInputElement && !h.el.isContentEditable);
    if (single) return single.el;
  }
  hits.sort((a, b) => a.lab.length - b.lab.length);
  return hits[0].el;
}

function fillText(matchers, value, exclude, prefer) {
  if (value == null || value === "") return false;
  const el = findField(matchers, { exclude, prefer });
  if (!el) return false;
  if (isProtectedLabel(labelText(el))) return false;
  return fillMultiline(el, value);
}

function listingFromPack(pack) {
  if (typeof LotLinkerListing !== "undefined") {
    if (LotLinkerListing.packToListing) return LotLinkerListing.packToListing(pack);
    if (LotLinkerListing.fromPack) return LotLinkerListing.fromPack(pack);
  }
  return {
    title: pack.title || "",
    modelLine: pack.modelLine || "",
    body: pack.body || "",
  };
}

function fillPack(pack) {
  const listing = listingFromPack(pack || {});
  const filled = [];
  const missed = [];
  const mark = (key, ok) => (ok ? filled : missed).push(key);
  const modelLine = listing.modelLine || "";

  mark(
    "model",
    fillText(
      [/^model$/, /\bvehicle model\b/, /\bmodel\b/],
      modelLine,
      [
        /description/,
        /\byear\b/,
        /\bmake\b/,
        /\bmileage\b/,
        /\bodometer\b/,
        /\bvin\b/,
        /vehicle identification/,
        /more details/,
        /clean title/,
        /title status/,
        /listing title/,
        /item title/,
      ],
      "single"
    )
  );

  mark(
    "description",
    fillText(
      [/^description$/, /\bdescription\b/, /more details/, /about this vehicle/, /tell buyers/],
      listing.body,
      [
        /^model$/,
        /\bvehicle model\b/,
        /\byear\b/,
        /\bmake\b/,
        /\bmileage\b/,
        /\bodometer\b/,
        /\bvin\b/,
        /clean title/,
        /title status/,
        /listing title/,
        /item title/,
      ],
      "multiline"
    )
  );

  return {
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    modelLine,
    title: listing.title,
    notes: "Model + description only. You hit Post.",
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.LotLinkerFill = { fillPack, isMarketplacePath, findField, labelText };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "LOT_LINKER_FILL") return;
    if (!isMarketplacePath()) {
      sendResponse({ ok: false, error: "Open a Facebook Marketplace listing tab first" });
      return true;
    }
    try {
      sendResponse({ ok: true, ...fillPack(msg.pack || {}) });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  });
}
