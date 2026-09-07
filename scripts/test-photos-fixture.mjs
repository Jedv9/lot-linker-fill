import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = new URL("./photos-fixture.html", import.meta.url);
const port = 9224;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitJson(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      /* chrome not up yet */
    }
    await delay(150);
  }
  throw new Error(`CDP not ready: ${url}`);
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let next = 0;
    const pending = new Map();
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++next;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
      });
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
  });
}

const dir = mkdtempSync(join(tmpdir(), "ll-chrome-"));
const child = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    fixture.href,
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => {
  stderr += d;
});

try {
  await waitJson(`http://127.0.0.1:${port}/json/version`);
  const tabs = await waitJson(`http://127.0.0.1:${port}/json/list`);
  const page = tabs.find((t) => t.type === "page" && /photos-fixture/.test(t.url || t.title || "")) ||
    tabs.find((t) => t.type === "page") ||
    tabs[0];
  assert.ok(page?.webSocketDebuggerUrl, `no CDP page: ${JSON.stringify(tabs)} ${stderr.slice(0, 300)}`);
  const session = await cdp(page.webSocketDebuggerUrl);
  let reportJson = "";
  for (let i = 0; i < 50; i++) {
    const ready = await session.send("Runtime.evaluate", {
      expression: "document.body && document.body.dataset.reportReady || ''",
      returnByValue: true,
    });
    if (ready?.result?.value === "1") {
      const got = await session.send("Runtime.evaluate", {
        expression: "document.body.dataset.report || ''",
        returnByValue: true,
      });
      reportJson = got?.result?.value || "";
      break;
    }
    await delay(200);
  }
  session.close();
  assert.ok(reportJson, `photos fixture did not write data-report\n${stderr.slice(0, 400)}`);
  const report = JSON.parse(reportJson);
  assert.equal(report.ok, true, `photos fixture failed: ${JSON.stringify(report)}`);
  assert.equal(report.neverPosted, true);
  assert.equal(report.photosOk, true);
  assert.equal(report.photoCount, 2);
  assert.ok(report.filled.includes("model"));
  assert.ok(report.filled.includes("description"));
  assert.ok(report.filled.includes("photos"));
  assert.equal(report.stripOk, true);
  assert.equal(report.extractedOk, true);

  console.log(
    `photos fixture: ${report.photoCount} files · strip ${report.stripInH}→${report.stripOutH} · filled ${report.filled.join(", ")}`
  );
  console.log("ok");
} finally {
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}
