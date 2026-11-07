/**
 * Honor HTTP 429 Retry-After with exponential backoff.
 * No proxies, no header spoofing, no private APIs.
 */

export function header(headers, name) {
  if (!headers) return "";
  const want = String(name).toLowerCase();
  if (typeof headers.get === "function") return String(headers.get(name) || headers.get(want) || "");
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return Array.isArray(v) ? String(v[0] || "") : String(v || "");
  }
  return "";
}

export function retryDelayMs(headers, attempt = 0, { baseMs = 4000, capMs = 60000 } = {}) {
  const raw = header(headers, "retry-after").trim();
  if (raw) {
    const sec = Number(raw);
    if (Number.isFinite(sec) && sec >= 0) return Math.min(capMs, Math.max(1000, Math.round(sec * 1000)));
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.min(capMs, Math.max(1000, when - Date.now()));
  }
  const exp = baseMs * 2 ** Math.max(0, attempt);
  return Math.min(capMs, Math.max(baseMs, exp));
}

export function isRetryableHttp(status, body = "") {
  if (status === 429 || status === 503) return true;
  const text = String(body || "");
  return text.length < 8000 && /too many requests/i.test(text);
}

export async function sleep(ms, waitFn) {
  const wait = waitFn || ((n) => new Promise((r) => setTimeout(r, n)));
  await wait(ms);
}
