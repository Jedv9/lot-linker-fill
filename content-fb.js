// Lot Linker Fill — Model + description only. Never Post. Never Year/Make/Mileage.
function isMarketplacePath() {
  return /marketplace/i.test(location.pathname + location.href);
}

const DESC_MATCHERS = [
  /^description$/,
  /\bdescription\b/,
  /\bdescribe\b/,
  /more details/,
  /about (this|your) vehicle/,
  /tell buyers/,
  /buyers about/,
  /what makes your/,
];

const DESC_EXCLUDE = [
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
];

const DESC_ATTR_SELECTORS = [
  '[aria-label="Description" i]',
  '[aria-label*="Description" i]',
  '[aria-placeholder="Description" i]',
  '[aria-placeholder*="Description" i]',
  '[placeholder*="Description" i]',
  '[placeholder*="Describe" i]',
  '[aria-label*="Describe" i]',
  '[aria-label*="Tell buyers" i]',
  '[aria-placeholder*="Tell buyers" i]',
  '[aria-label*="More details" i]',
  '[aria-label*="about your vehicle" i]',
  '[aria-label*="about this vehicle" i]',
  '[data-placeholder*="Description" i]',
];

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
  try {
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        data: next,
        inputType: "insertFromPaste",
      })
    );
  } catch {
    /* older engines */
  }
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

function htmlFromMultiline(text) {
  return String(text)
    .split("\n")
    .map((line) => (line ? escapeHtml(line) : ""))
    .join("<br>");
}

function readFilled(el) {
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value || "";
  return el.innerText || el.textContent || "";
}

function looksFilled(el, text) {
  const got = readFilled(el).replace(/\r\n/g, "\n");
  const exp = String(text).replace(/\r\n/g, "\n");
  if (!got) return false;
  return got === exp || got.includes(exp.slice(0, Math.min(24, exp.length)));
}

function scrollElIntoView(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  } catch {
    try {
      el.scrollIntoView();
    } catch {
      /* ignore */
    }
  }
  let p = el.parentElement;
  for (let i = 0; i < 8 && p; i++) {
    try {
      const st = getComputedStyle(p);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll" || p.scrollHeight > p.clientHeight + 40) && p.scrollHeight > p.clientHeight) {
        const r = el.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        p.scrollTop += r.top - pr.top - p.clientHeight / 3;
      }
    } catch {
      /* ignore */
    }
    p = p.parentElement;
  }
}

function resolveEditable(el) {
  if (!el) return el;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el;
  const innerTa = el.querySelector?.("textarea");
  if (innerTa && isDisplayed(innerTa)) return innerTa;
  if (el.isContentEditable) return el;
  const innerCe = el.querySelector?.("[contenteditable]:not([contenteditable=false])");
  if (innerCe) return innerCe;
  if (innerTa) return innerTa;
  return el;
}

function fillMultiline(el, value) {
  const text = String(value);
  const target = resolveEditable(el) || el;
  scrollElIntoView(target);
  try {
    target.focus();
  } catch {
    /* ignore */
  }
  try {
    target.click();
  } catch {
    /* ignore */
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (setNativeValue(target, text) && looksFilled(target, text)) return true;
  }

  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      target.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          data: text,
          inputType: "insertFromPaste",
        })
      );
    } catch {
      /* ignore */
    }
    if (document.execCommand("insertText", false, text)) {
      target.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: text })
      );
      if (looksFilled(target, text)) return true;
    }
  } catch {
    /* fall through */
  }

  target.innerHTML = htmlFromMultiline(text);
  try {
    target.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        data: text,
        inputType: "insertFromPaste",
      })
    );
  } catch {
    /* ignore */
  }
  target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: text }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return looksFilled(target, text) || Boolean(readFilled(target).trim());
}

function shortText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isControl(node) {
  return node?.matches?.(
    "input, textarea, select, [contenteditable], [role=textbox], [role=combobox]"
  );
}

function collectNearbyLabel(node, bits) {
  if (!node || isControl(node)) return;
  const lab = node.querySelector?.(":scope > label, :scope > span, :scope > [role=label], :scope > p, :scope > legend");
  if (lab && !lab.querySelector("input, textarea, [contenteditable], [role=textbox]")) {
    const t = shortText(lab.textContent);
    if (t && t.length < 80) bits.push(t);
  }
}

function labelText(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("aria-placeholder"),
    el.getAttribute("data-placeholder"),
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
  if (closestLabel) {
    const t = shortText(closestLabel.textContent);
    if (t && t.length < 80) bits.push(t);
    else {
      const inner = [...closestLabel.querySelectorAll("span, div, p")].find((n) => {
        const s = shortText(n.textContent);
        return s && s.length < 40 && !n.contains(el) && !n.querySelector("input, textarea, [role=textbox]");
      });
      if (inner) bits.push(inner.textContent);
    }
  }

  const sib = el.previousElementSibling;
  if (sib && sib.matches("label, span, div, p, legend") && !isControl(sib) && !sib.querySelector("input, textarea, [contenteditable], [role=textbox]")) {
    const t = shortText(sib.textContent);
    if (t && t.length < 80) bits.push(t);
  }

  let node = el.parentElement;
  for (let depth = 0; depth < 8 && node; depth++) {
    bits.push(node.getAttribute("aria-label"));
    bits.push(node.getAttribute("aria-placeholder"));
    bits.push(node.getAttribute("data-placeholder"));
    bits.push(node.getAttribute("placeholder"));
    collectNearbyLabel(node, bits);
    const sibLab = node.previousElementSibling;
    if (
      sibLab &&
      sibLab.matches("label, span, div, p, legend, [role=label]") &&
      !isControl(sibLab) &&
      !sibLab.querySelector("input, textarea, [contenteditable], [role=textbox]")
    ) {
      const t = shortText(sibLab.textContent);
      if (t && t.length < 80) bits.push(t);
    }
    node = node.parentElement;
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

function isDisplayed(el) {
  if (!el || el.disabled) return false;
  try {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
  } catch {
    /* ignore */
  }
  const r = el.getBoundingClientRect();
  return r.width >= 2 || r.height >= 2 || el.offsetParent != null;
}

function innermostEditable(el) {
  if (!el) return null;
  const inner = el.querySelector?.("textarea, [contenteditable]:not([contenteditable=false])");
  if (inner) return inner;
  return el;
}

function controlInside(root) {
  if (!root) return null;
  if (root.matches?.("input, textarea, [contenteditable], [role=textbox]")) return innermostEditable(root);
  const list = [
    ...root.querySelectorAll(
      "textarea, [contenteditable]:not([contenteditable=false]), [role=textbox], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button])"
    ),
  ];
  const visible = list.filter(isDisplayed);
  const pool = visible.length ? visible : list;
  const pick = pool.find((el) => isMultilineEl(el)) || pool[0];
  return pick ? innermostEditable(pick) : null;
}

function usableDescription(el) {
  if (!el) return false;
  const lab = labelText(el);
  if (isProtectedLabel(lab)) return false;
  if (DESC_EXCLUDE.some((x) => x.test(lab))) return false;
  return true;
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

function controlAfterLabel(node) {
  let sib = node.nextElementSibling;
  for (let i = 0; i < 6 && sib; i++) {
    const c = controlInside(sib) || (isControl(sib) ? innermostEditable(sib) : null);
    if (c && usableDescription(c)) return c;
    sib = sib.nextElementSibling;
  }
  let parent = node.parentElement;
  for (let d = 0; d < 5 && parent; d++) {
    const c = controlInside(parent);
    if (c && usableDescription(c)) return c;
    sib = parent.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++) {
      const cc = controlInside(sib) || (isControl(sib) ? innermostEditable(sib) : null);
      if (cc && usableDescription(cc)) return cc;
      sib = sib.nextElementSibling;
    }
    parent = parent.parentElement;
  }
  return null;
}

function findDescriptionByAttr() {
  for (const sel of DESC_ATTR_SELECTORS) {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll(sel)];
    } catch {
      continue;
    }
    for (const node of nodes) {
      const el = controlInside(node);
      if (el && usableDescription(el)) {
        const kind = el instanceof HTMLTextAreaElement
          ? "textarea"
          : el.isContentEditable
            ? "[contenteditable]"
            : el.getAttribute("role") === "textbox"
              ? "[role=textbox]"
              : el.tagName.toLowerCase();
        return { el, via: `${sel} ${kind}` };
      }
    }
  }
  return null;
}

function findDescriptionByNearbyLabel() {
  const nodes = document.querySelectorAll("span, label, div, p, legend, [role=label]");
  for (const node of nodes) {
    if (node.querySelector("input, textarea, [contenteditable], [role=textbox]")) continue;
    const t = shortText(node.textContent).toLowerCase();
    if (!t || t.length > 60) continue;
    if (!DESC_MATCHERS.some((m) => m.test(t))) continue;
    if (isProtectedLabel(t) && !/\bdescription\b/.test(t)) continue;
    const control = controlAfterLabel(node);
    if (control) return { el: resolveEditable(control), via: `near-label("${t}")` };
  }
  return null;
}

function findDescriptionFallback() {
  const textareas = [...document.querySelectorAll("textarea")].filter((el) => usableDescription(el) && isDisplayed(el));
  if (textareas.length === 1) return { el: textareas[0], via: "lone-textarea" };

  const boxes = allInputs().filter((el) => isMultilineEl(el) && usableDescription(el) && isDisplayed(el));
  if (!boxes.length) return null;
  boxes.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  });
  return { el: resolveEditable(boxes[0]), via: "fallback-largest-multiline" };
}

function findDescriptionField() {
  const byAttr = findDescriptionByAttr();
  if (byAttr) return byAttr;

  const labeled = findField(DESC_MATCHERS, { exclude: DESC_EXCLUDE, prefer: "multiline" });
  if (labeled && usableDescription(labeled)) {
    const el = resolveEditable(labeled);
    const kind = el instanceof HTMLTextAreaElement
      ? "textarea"
      : el.isContentEditable
        ? "[contenteditable]"
        : "[role=textbox]";
    return { el, via: `labeled ${kind}` };
  }

  const near = findDescriptionByNearbyLabel();
  if (near) return near;

  return findDescriptionFallback();
}

function revealDescriptionArea() {
  const hints = [];
  for (const n of document.querySelectorAll("span, label, div, p, [aria-label], [aria-placeholder]")) {
    const t = shortText(
      n.getAttribute("aria-label") || n.getAttribute("aria-placeholder") || n.textContent || ""
    ).toLowerCase();
    if (t && t.length < 80 && DESC_MATCHERS.some((m) => m.test(t))) {
      hints.push(n);
      if (hints.length > 8) break;
    }
  }
  for (const n of hints) scrollElIntoView(n);
  const scroller = document.querySelector("[role=main], [role=dialog]") || document.scrollingElement;
  if (scroller) {
    try {
      scroller.scrollTop = Math.min(scroller.scrollHeight, (scroller.scrollTop || 0) + 900);
    } catch {
      /* ignore */
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function fillDescription(value) {
  if (value == null || value === "") return { ok: false, via: "" };
  const found = findDescriptionField();
  if (!found?.el) return { ok: false, via: "" };
  if (isProtectedLabel(labelText(found.el))) return { ok: false, via: "" };
  scrollElIntoView(found.el);
  const ok = fillMultiline(found.el, value);
  return { ok, via: ok ? found.via : "" };
}

function fillPackOnce(pack) {
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

  const desc = fillDescription(listing.body);
  mark("description", desc.ok);

  return {
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    modelLine,
    title: listing.title,
    descriptionHit: desc.via || "",
    notes: "Model + description only. You hit Post.",
  };
}

async function fillPack(pack) {
  const first = fillPackOnce(pack);
  if (!first.missed.includes("description")) return first;
  revealDescriptionArea();
  await delay(280);
  return fillPackOnce(pack);
}

if (typeof globalThis !== "undefined") {
  globalThis.LotLinkerFill = {
    fillPack,
    fillPackOnce,
    isMarketplacePath,
    findField,
    findDescriptionField,
    labelText,
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "LOT_LINKER_FILL") return;
    if (!isMarketplacePath()) {
      sendResponse({ ok: false, error: "Open a Facebook Marketplace listing tab first" });
      return true;
    }
    Promise.resolve()
      .then(() => fillPack(msg.pack || {}))
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
}
