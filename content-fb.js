// Lot Linker Fill — Year/Make/Price + Model + description + photos.
// Never VIN. Never mileage/colors. Never Post.
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
  if (isVinControl(el)) return false;
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
  if (isVinControl(el)) return false;
  const text = String(value);
  const target = resolveEditable(el) || el;
  if (isVinControl(target)) return false;
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
  // Description must never land on these spec controls.
  return (
    /\byear\b/.test(lab) ||
    /\bmake\b/.test(lab) ||
    /\bmileage\b/.test(lab) ||
    /\bodometer\b/.test(lab) ||
    /\bvin\b/.test(lab) ||
    /vehicle identification/.test(lab)
  );
}

function isVinLabel(lab) {
  const t = String(lab || "").toLowerCase();
  return /\bvin\b/.test(t) || /vehicle identification/.test(t);
}

/** Hard stop: never write the Marketplace VIN field. */
function isVinControl(el) {
  if (!el) return false;
  if (isVinLabel(ownLabel(el))) return true;
  const bits = [el.name, el.id, el.getAttribute?.("autocomplete"), el.getAttribute?.("aria-label")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bvin\b/.test(bits) || /vehicle identification/.test(bits);
}

function ownLabel(el) {
  if (!el) return "";
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("aria-placeholder"),
    el.getAttribute("data-placeholder"),
    el.placeholder,
    el.name,
    el.id && el.id.length < 24 ? el.id : "",
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
    if (t && t.length < 48) bits.push(t);
  }
  const prev = el.previousElementSibling;
  if (prev && !isControl(prev) && !prev.querySelector?.("input, textarea, [contenteditable], [role=textbox], [role=combobox]")) {
    const t = shortText(prev.textContent);
    if (t && t.length < 40) bits.push(t);
  }
  const parent = el.parentElement;
  if (parent) {
    const pLab = parent.getAttribute("aria-label");
    if (pLab) bits.push(pLab);
    const kid = [...parent.children].find((n) => {
      if (n === el || isControl(n)) return false;
      const t = shortText(n.textContent);
      return t && t.length < 32 && !n.querySelector("input, textarea, [role=textbox], [role=combobox]");
    });
    if (kid) bits.push(kid.textContent);
  }
  return bits.filter(Boolean).map(shortText).filter(Boolean).join(" ").toLowerCase();
}

function isBlankPackValue(v) {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  return !s || /^(\[need\]|n\/?a|unknown|tbd|none|-)$/i.test(s);
}

function priceDigits(pack) {
  const n = Number(String(pack?.price ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n));
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
  if (!el || isVinControl(el)) return false;
  const lab = labelText(el);
  if (isProtectedLabel(lab)) return false;
  if (DESC_EXCLUDE.some((x) => x.test(lab))) return false;
  return true;
}

function findField(matchers, { exclude = [], prefer } = {}) {
  const hits = [];
  for (const el of allInputs()) {
    if (isVinControl(el)) continue;
    const own = ownLabel(el);
    if (isVinLabel(own)) continue;
    if (exclude.some((x) => x.test(own))) continue;
    if (own && matchers.some((m) => m.test(own))) {
      hits.push({ el, lab: own, ownHit: true });
      continue;
    }
    const deep = labelText(el);
    if (isVinLabel(deep)) continue;
    if (exclude.some((x) => x.test(deep))) continue;
    if (deep && matchers.some((m) => m.test(deep))) {
      hits.push({ el, lab: deep, ownHit: false });
    }
  }
  if (!hits.length) return null;
  const pool = hits.some((h) => h.ownHit) ? hits.filter((h) => h.ownHit) : hits;
  if (prefer === "multiline") {
    const multi = pool.find((h) => isMultilineEl(h.el));
    if (multi) return multi.el;
  }
  if (prefer === "single") {
    const single = pool.find((h) => h.el instanceof HTMLInputElement && !h.el.isContentEditable);
    if (single) return single.el;
  }
  pool.sort((a, b) => a.lab.length - b.lab.length);
  return pool[0].el;
}

function fillText(matchers, value, exclude, prefer) {
  if (value == null || value === "") return false;
  const el = findField(matchers, { exclude, prefer });
  if (!el || isVinControl(el)) return false;
  return fillMultiline(el, value);
}

function optionText(el) {
  return shortText(el?.textContent || el?.getAttribute?.("aria-label") || "");
}

function findChoiceControl(matchers, exclude = []) {
  const nodes = [
    ...document.querySelectorAll(
      '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button])'
    ),
  ];
  const hits = [];
  for (const el of nodes) {
    const own = ownLabel(el);
    const lab = own || labelText(el);
    if (!lab) continue;
    if (isVinControl(el) || isVinLabel(own) || isVinLabel(lab)) continue;
    if (exclude.some((x) => x.test(own) || x.test(lab))) continue;
    const ownHit = own && matchers.some((m) => m.test(own));
    const deepHit = matchers.some((m) => m.test(lab) || m.test(labelText(el)));
    if (!ownHit && !deepHit) continue;
    hits.push({ el, lab: own || lab, ownHit });
  }
  if (!hits.length) {
    for (const el of document.querySelectorAll("[aria-label], [role=button]")) {
      if (isUnsafeClickTarget(el)) continue;
      const own = ownLabel(el);
      const lab = own || labelText(el);
      if (!lab) continue;
      if (isVinControl(el) || isVinLabel(own) || isVinLabel(lab)) continue;
      if (exclude.some((x) => x.test(own) || x.test(lab))) continue;
      if (!matchers.some((m) => m.test(own) || m.test(lab))) continue;
      if (el.closest("input, textarea, [contenteditable]")) continue;
      hits.push({ el, lab, ownHit: Boolean(own && matchers.some((m) => m.test(own))) });
    }
  }
  if (!hits.length) return null;
  const pool = hits.some((h) => h.ownHit) ? hits.filter((h) => h.ownHit) : hits;
  pool.sort((a, b) => a.lab.length - b.lab.length);
  return pool[0].el;
}

function fillNativeSelect(el, value) {
  const want = String(value).toLowerCase();
  const opt = [...el.options].find((o) => {
    const t = shortText(o.textContent).toLowerCase();
    return t === want || o.value === String(value) || t.startsWith(want);
  });
  if (!opt) return false;
  el.value = opt.value;
  try {
    el._valueTracker?.setValue("");
  } catch {
    /* ignore */
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function pickOpenOption(want) {
  const w = shortText(want).toLowerCase();
  if (!w) return false;
  const opts = [
    ...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], li[role="option"]'),
  ].filter((o) => !isUnsafeClickTarget(o) && isDisplayed(o));
  const scored = opts
    .map((el) => {
      const t = optionText(el).toLowerCase();
      let score = 0;
      if (t === w) score = 3;
      else if (t.startsWith(w)) score = 2;
      else if (t.includes(w)) score = 1;
      return { el, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const hit = scored[0]?.el;
  if (!hit) return false;
  try {
    hit.click();
  } catch {
    return false;
  }
  return true;
}

function choiceLooksSet(el, value) {
  if (!el) return false;
  if (el instanceof HTMLSelectElement) {
    const t = shortText(el.selectedOptions?.[0]?.textContent || el.value);
    return t.toLowerCase() === String(value).toLowerCase() || t.toLowerCase().startsWith(String(value).toLowerCase());
  }
  return looksFilled(el, value);
}

async function fillChoice(matchers, value, exclude = []) {
  if (isBlankPackValue(value)) return false;
  const el = findChoiceControl(matchers, exclude) || findField(matchers, { exclude });
  if (!el || isUnsafeClickTarget(el) || isVinControl(el) || isVinLabel(ownLabel(el))) return false;
  if (el instanceof HTMLSelectElement) return fillNativeSelect(el, value);
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && fillMultiline(el, value) && looksFilled(el, value)) {
    return true;
  }
  scrollElIntoView(el);
  try {
    el.focus();
  } catch {
    /* ignore */
  }
  try {
    el.click();
  } catch {
    /* ignore */
  }
  await delay(180);
  if (pickOpenOption(value)) {
    await delay(80);
    return choiceLooksSet(el, value) || true;
  }
  const active = document.activeElement;
  if (active && (active instanceof HTMLInputElement || active.getAttribute("role") === "combobox")) {
    if (active instanceof HTMLInputElement) fillMultiline(active, value);
    else {
      try {
        active.textContent = String(value);
        active.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: String(value) }));
      } catch {
        /* ignore */
      }
    }
    await delay(200);
    if (pickOpenOption(value)) {
      await delay(80);
      return true;
    }
  }
  if (el instanceof HTMLInputElement) return fillMultiline(el, value) && looksFilled(el, value);
  return choiceLooksSet(el, value);
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

const PHOTO_LABEL_RE = /\b(photo|photos|picture|pictures|image|images|gallery|media)\b/i;
const PHOTO_EXCLUDE_RE = /\b(profile|avatar|cover photo|comment|messenger|story)\b/i;
const PHOTO_REVEAL_RE = /^(add photos?|upload photos?|add pictures?|choose (files?|photos?)|photos|add media)$/i;
const NEVER_CLICK_RE = /^(post|publish|next|submit|share|create listing|publish listing)$/i;

function photoContext(el) {
  if (!el) return "";
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
    el.getAttribute("name"),
    el.getAttribute("accept"),
    el.getAttribute("id"),
  ];
  let node = el;
  for (let d = 0; d < 6 && node; d++) {
    bits.push(node.getAttribute?.("aria-label"));
    bits.push(node.getAttribute?.("aria-placeholder"));
    const labeledBy = node.getAttribute?.("aria-labelledby");
    if (labeledBy) {
      for (const id of labeledBy.split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) bits.push(n.textContent);
      }
    }
    node = node.parentElement;
  }
  return bits.filter(Boolean).map(shortText).join(" ").toLowerCase();
}

function acceptsImages(input) {
  const accept = (input.getAttribute("accept") || "").toLowerCase();
  return !accept || accept.includes("image") || accept.includes("*/*") || accept.includes("*");
}

function findPhotoFileInput() {
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  const scored = [];
  for (const el of inputs) {
    if (el.disabled) continue;
    if (!acceptsImages(el)) continue;
    const lab = photoContext(el);
    if (PHOTO_EXCLUDE_RE.test(lab) && !PHOTO_LABEL_RE.test(lab)) continue;
    let score = 0;
    if (el.multiple) score += 3;
    if (/image/.test(el.getAttribute("accept") || "")) score += 2;
    if (PHOTO_LABEL_RE.test(lab)) score += 6;
    if (el.closest("[role=dialog], [role=main], form")) score += 1;
    scored.push({ el, score, lab, via: el.multiple ? 'input[type=file][multiple]' : 'input[type=file]' });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function findPhotoDropzone() {
  const nodes = [
    ...document.querySelectorAll("[aria-label], [role=button], button, [tabindex], div, span"),
  ];
  for (const n of nodes) {
    const lab = shortText(n.getAttribute("aria-label") || n.getAttribute("title") || "");
    if (PHOTO_REVEAL_RE.test(lab) && !NEVER_CLICK_RE.test(lab)) return n;
    const t = shortText(n.textContent);
    if (t && t.length < 28 && PHOTO_REVEAL_RE.test(t) && !NEVER_CLICK_RE.test(t)) {
      if (n.querySelector?.("input, textarea, [contenteditable]")) continue;
      return n;
    }
  }
  return null;
}

function isUnsafeClickTarget(el) {
  if (!el) return true;
  const t = shortText(el.getAttribute("aria-label") || el.textContent || "");
  return NEVER_CLICK_RE.test(t) || /\b(post|publish) listing\b/i.test(t);
}

function revealPhotoPicker() {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
  const scroller = document.querySelector("[role=main], [role=dialog]") || document.scrollingElement;
  if (scroller) {
    try {
      scroller.scrollTop = 0;
    } catch {
      /* ignore */
    }
  }
  const zone = findPhotoDropzone();
  if (zone && !isUnsafeClickTarget(zone)) {
    scrollElIntoView(zone);
    try {
      zone.click();
    } catch {
      /* ignore */
    }
    return zone;
  }
  return null;
}

function assignFilesToInput(input, files) {
  if (!input || !files?.length) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  try {
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  } catch {
    /* ignore */
  }
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return input.files && input.files.length === files.length;
}

function dropFilesOn(target, files) {
  if (!target || !files?.length) return false;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  for (const type of ["dragenter", "dragover", "drop"]) {
    try {
      target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt })
      );
    } catch {
      /* older engines */
    }
  }
  return true;
}

async function waitForPhotoInput({ tries = 16, delayMs = 280 } = {}) {
  let last = findPhotoFileInput();
  if (last) return last;
  revealPhotoPicker();
  for (let i = 0; i < tries; i++) {
    await delay(delayMs);
    last = findPhotoFileInput();
    if (last) return last;
    if (i === 3 || i === 8) revealPhotoPicker();
  }
  return last;
}

function filesFromPrepared(payloads) {
  if (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.filesFromTransfer) {
    return LotLinkerPhotos.filesFromTransfer(payloads);
  }
  return [];
}

async function loadPhotoFiles(pack) {
  const empty = { ok: false, files: [], wanted: 0, stripped: 0, source: "", error: "No photos" };
  if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "LOT_LINKER_PREPARE_PHOTOS", pack }, (r) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve(r);
        });
      });
      if (res?.ok && res.files?.length) {
        return {
          ok: true,
          files: filesFromPrepared(res.files),
          wanted: res.wanted,
          stripped: res.stripped,
          source: res.source,
          error: res.error || "",
          missedUrls: res.missedUrls || 0,
        };
      }
      if (res && !res.ok && res.error) empty.error = res.error;
    } catch {
      /* fall through to in-page fetch (fixture / SW missing) */
    }
  }
  if (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.fetchPhotoFiles) {
    return LotLinkerPhotos.fetchPhotoFiles(pack);
  }
  return empty;
}

async function uploadPhotoFiles(files) {
  if (!files?.length) return { ok: false, via: "", count: 0, error: "No photo files" };
  const found = await waitForPhotoInput();
  if (!found?.el) {
    return { ok: false, via: "", count: 0, error: "no photo picker on this page" };
  }
  scrollElIntoView(found.el);
  let ok = assignFilesToInput(found.el, files);
  if (!ok) {
    const zone = findPhotoDropzone() || found.el.closest("div") || found.el;
    dropFilesOn(zone, files);
    ok = assignFilesToInput(found.el, files) || (found.el.files && found.el.files.length > 0);
  }
  const count = found.el.files?.length || (ok ? files.length : 0);
  return {
    ok: count > 0,
    via: found.via || "input[type=file]",
    count,
    error: count ? "" : "Marketplace file input rejected files",
  };
}

async function fillPhotos(pack) {
  const photos = {
    attempted: false,
    count: 0,
    wanted: 0,
    stripped: 0,
    source: "",
    via: "",
    error: "",
  };
  const hasSource =
    (typeof LotLinkerPhotos !== "undefined" && LotLinkerPhotos.hasPhotoSource?.(pack)) ||
    Boolean(pack?.photoUrls?.length || pack?.vdpUrl);
  if (!hasSource) return { skipped: true, photos };

  photos.attempted = true;
  const loaded = await loadPhotoFiles(pack);
  photos.wanted = loaded.wanted || 0;
  photos.stripped = loaded.stripped || 0;
  photos.source = loaded.source || "";
  if (!loaded.ok || !loaded.files?.length) {
    photos.error = loaded.error || "could not fetch photos";
    return { skipped: false, ok: false, photos };
  }
  const placed = await uploadPhotoFiles(loaded.files);
  photos.via = placed.via;
  photos.count = placed.count;
  if (!placed.ok) {
    photos.error = placed.error || "photo picker missed";
    return { skipped: false, ok: false, photos };
  }
  if (photos.wanted && photos.count < photos.wanted) {
    photos.error = `uploaded ${photos.count} of ${photos.wanted}`;
  }
  return { skipped: false, ok: true, photos };
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
  if (isVinControl(found.el) || isProtectedLabel(labelText(found.el))) return { ok: false, via: "" };
  scrollElIntoView(found.el);
  const ok = fillMultiline(found.el, value);
  return { ok, via: ok ? found.via : "" };
}

const MODEL_EXCLUDE = [
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
  /\bprice\b/,
  /\btrim\b/,
];

const CHOICE_EXCLUDE = [
  /description/,
  /tell buyers/,
  /what makes/,
  /more details/,
  /listing title/,
  /item title/,
  /\bvin\b/,
  /vehicle identification/,
];

function markIfPresent(mark, key, packHas, ok) {
  if (!packHas) return;
  mark(key, ok);
}

async function fillPackOnce(pack) {
  // Filled only: Year, Make, Price, Model title line, Description.
  // Never VIN. Never mileage, colors, trim, or body style.
  const p = pack || {};
  const listing = listingFromPack(p);
  const filled = [];
  const missed = [];
  const mark = (key, ok) => (ok ? filled : missed).push(key);
  const modelLine = listing.modelLine || "";

  const yearVal = isBlankPackValue(p.year) ? "" : String(p.year).trim();
  markIfPresent(
    mark,
    "year",
    Boolean(yearVal),
    await fillChoice([/^year$/, /\byear\b/], yearVal, [...CHOICE_EXCLUDE, /\bmake\b/, /\bmodel\b/])
  );
  if (yearVal) await delay(200);

  const makeVal = isBlankPackValue(p.make) ? "" : String(p.make).trim();
  markIfPresent(
    mark,
    "make",
    Boolean(makeVal),
    await fillChoice([/^make$/, /\bmake\b/, /manufacturer/], makeVal, [...CHOICE_EXCLUDE, /\byear\b/, /\bmodel\b/])
  );
  if (makeVal) await delay(150);

  mark(
    "model",
    fillText([/^model$/, /\bvehicle model\b/, /\bmodel\b/], modelLine, MODEL_EXCLUDE, "single")
  );

  const price = priceDigits(p);
  markIfPresent(
    mark,
    "price",
    Boolean(price),
    fillText(
      [/^price$/, /\bprice\b/, /asking price/, /listing price/],
      price,
      [/mileage/, /odometer/, /description/, /\bmodel\b/, /year/, /make/, /\bvin\b/],
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
    notes: "Year/Make/Price + Model + description + photos. Never VIN. You hit Post.",
  };
}

function mergePhotoResult(textResult, photoResult) {
  const filled = [...(textResult.filled || [])];
  const missed = [...(textResult.missed || [])];
  const photos = photoResult?.photos || { attempted: false, count: 0 };
  if (!photoResult?.skipped) {
    if (photoResult?.ok && photos.count > 0) filled.push("photos");
    else missed.push("photos");
  }
  return {
    ...textResult,
    filled: [...new Set(filled)],
    missed: [...new Set(missed)],
    photos,
    notes: "Year/Make/Price + Model + description + photos. Never VIN. You hit Post.",
  };
}

async function fillPack(pack) {
  let textResult = await fillPackOnce(pack);
  const retryKeys = ["description", "year", "make", "price", "model"].filter((k) => textResult.missed.includes(k));
  if (retryKeys.length) {
    revealDescriptionArea();
    await delay(280);
    textResult = await fillPackOnce(pack);
  }
  const photoResult = await fillPhotos(pack || {});
  return mergePhotoResult(textResult, photoResult);
}

if (typeof globalThis !== "undefined") {
  globalThis.LotLinkerFill = {
    fillPack,
    fillPackOnce,
    fillPhotos,
    uploadPhotoFiles,
    assignFilesToInput,
    findPhotoFileInput,
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
