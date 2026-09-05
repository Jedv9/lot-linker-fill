// Lot Linker Fill — title + description only. Never Post.
function isMarketplacePath() {
  return /marketplace/i.test(location.pathname + location.href);
}

function setNativeValue(el, value) {
  if (!el || value == null) return false;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
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
    return setNativeValue(el, text);
  }
  el.focus();
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand("insertText", false, text)) {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return true;
    }
  } catch {
    /* fall through */
  }
  el.innerHTML = text.split("\n").map((line) => escapeHtml(line)).join("<br>");
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

function labelText(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.placeholder,
    el.name,
    el.id,
    el.getAttribute("aria-labelledby") &&
      document.getElementById(el.getAttribute("aria-labelledby"))?.textContent,
  ];
  const label = el.closest("label");
  if (label) bits.push(label.textContent);
  const wrap = el.closest("div");
  if (wrap) {
    const lab = wrap.querySelector("label, span, div");
    if (lab && lab !== el) bits.push(lab.textContent);
  }
  return (bits.filter(Boolean).join(" ") || "").toLowerCase().replace(/\s+/g, " ");
}

function allInputs() {
  return [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true], [role=textbox]"
    ),
  ];
}

function findField(matchers, { exclude = [] } = {}) {
  for (const el of allInputs()) {
    const lab = labelText(el);
    if (exclude.some((x) => x.test(lab))) continue;
    if (matchers.some((m) => m.test(lab))) return el;
  }
  return null;
}

function fillText(matchers, value, exclude) {
  if (value == null || value === "") return false;
  const el = findField(matchers, { exclude });
  if (!el) return false;
  return fillMultiline(el, value);
}

function listingFromPack(pack) {
  if (typeof LotLinkerListing !== "undefined" && LotLinkerListing.fromPack) {
    return LotLinkerListing.fromPack(pack);
  }
  return { title: pack.title || "", body: pack.body || "" };
}

function fillPack(pack) {
  const listing = listingFromPack(pack || {});
  const filled = [];
  const missed = [];
  const mark = (key, ok) => (ok ? filled : missed).push(key);

  mark(
    "title",
    fillText(
      [/\blisting title\b/, /\bitem title\b/, /^title$/, /\btitle\b/, /\bheadline\b/],
      listing.title,
      [/description/, /clean title/, /title status/, /vehicle identification/, /\bvin\b/, /more details/]
    )
  );

  mark(
    "description",
    fillText(
      [/^description$/, /\bdescription\b/, /more details/, /about this vehicle/, /tell buyers/],
      listing.body,
      [/\btitle\b/, /\bvin\b/]
    )
  );

  return {
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    title: listing.title,
    notes: "Title + description only. You hit Post.",
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.LotLinkerFill = { fillPack, isMarketplacePath };
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
