// Isolated browser checks: real components, mocked auth/API, no project access.
// Run: node scripts/test-activity-ui.mjs (CHROME_PATH may override local Chrome).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "concert-activity-ui-"));
const mocks = {
  "@/contexts/AuthContext": `export const useAuth = () => ({ can: () => window.__allowed, appUser: { uid: "worker" } });`,
  "@/lib/firebase": `export const auth = { currentUser: { uid: "worker", getIdToken: async () => "fake-token" } };`,
  "next/navigation": `export const usePathname = () => "/admin/activity";`,
  "next/link": `import React from "react"; export default function Link(props) { return <a {...props} />; }`,
  "@/lib/api": `export const api = { get: async (path) => {
    window.__calls.push(path);
    await new Promise(r => setTimeout(r, 10));
    if (window.__deny) throw Error("لا تملك صلاحية عرض سجل النشاطات");
    const params = new URL(path, location.origin).searchParams;
    let data = window.__entries.filter(e => (!params.get("q") || e.actorName.includes(params.get("q"))) && (!params.get("status") || e.status === params.get("status")));
    const start = params.get("cursor") ? data.findIndex(e => e.id === params.get("cursor")) + 1 : 0;
    const entries = data.slice(start, start + Number(params.get("limit")));
    return { entries, nextCursor: start + entries.length < data.length ? entries.at(-1).id : null };
  }};`,
};
const bundled = await build({
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ActivityFeed } from "@/components/activity-feed";
    import { ActivityTracker } from "@/components/activity-tracker";
    window.__allowed = true; window.__calls = []; window.__events = [];
    window.__entries = Array.from({ length: 60 }, (_, i) => ({
      id: "event-" + i, actorId: "worker-" + i, actorName: i % 2 ? "أحمد" : "محمد",
      actorEmail: "employee" + i + "@example.test", action: "تعديل — الحفلات — حفل التخرج",
      path: "/api/concerts/concert-" + i, targetId: "concert-" + i,
      status: i % 3 ? "success" : "failed", source: "server", createdAt: "2026-09-23T10:15:30.000Z"
    }));
    window.fetch = async (_path, options) => { window.__events.push(...JSON.parse(options.body).events); return new Response("{}", { status: 200 }); };
    const root = createRoot(document.getElementById("root"));
    let key = 0;
    window.__render = (full = true, tracker = false) => root.render(<React.Fragment key={++key}><ActivityFeed full={full} />{tracker && <ActivityTracker />}</React.Fragment>);
    window.__render();
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-activity-dependencies", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
  } }],
});
const css = await postcss([tailwind()]).process(await fs.readFile("app/globals.css", "utf8"), { from: path.join(root, "app/globals.css") });
const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundled.outputFiles[0].text); }
  else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css.css); }
  else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="font-family:Tahoma,sans-serif;padding:16px"><main style="max-width:1024px;margin:auto" id="root"></main><div id="controls"><button id="save">حفظ التعديلات</button><input id="password" type="password" value="NEVER-LOG-THIS"><button id="disabled" disabled>معطل</button></div><script src="/bundle.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.querySelectorAll("li").length === 30);
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: false });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("عرض المزيد")).click());
  await page.waitForFunction(() => document.querySelectorAll("li").length === 60);
  await page.type('input[placeholder]', "أحمد");
  await page.evaluate(() => document.querySelector("form").requestSubmit());
  await page.waitForFunction(() => document.querySelectorAll("li").length === 30 && [...document.querySelectorAll("li")].every(li => li.textContent.includes("أحمد")));
  await page.select("select", "success");
  await page.evaluate(() => document.querySelector("form").requestSubmit());
  await page.waitForFunction(() => document.querySelectorAll("li").length === 20);
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, "mobile.png"), fullPage: false });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile layout must not overflow");
  await page.evaluate(() => window.__render(false));
  await page.waitForFunction(() => document.querySelectorAll("li").length === 5);
  assert.equal(await page.$eval('a[href="/admin/activity"]', a => a.textContent), "مشاهدة الكل");
  await page.evaluate(() => { window.__allowed = false; window.__render(); });
  await page.waitForFunction(() => document.getElementById("root").textContent === "");
  const deniedCalls = await page.evaluate(() => window.__calls.length);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await page.evaluate(() => window.__calls.length), deniedCalls, "hidden feed must not fetch");
  await page.evaluate(() => { window.__allowed = true; window.__deny = true; window.__render(); });
  await page.waitForSelector('[role="alert"]');
  assert.equal(await page.$$eval("li", list => list.length), 0);
  await page.evaluate(() => { window.__deny = false; window.__render(false, true); });
  await page.waitForFunction(() => window.__events.length > 0);
  await page.click("#save");
  await page.type("#password", "PRIVATE");
  await page.click("#disabled");
  await page.waitForFunction(() => window.__events.some(e => e.action.includes("حفظ التعديلات")));
  const events = await page.evaluate(() => window.__events);
  assert.ok(!JSON.stringify(events).includes("NEVER-LOG-THIS"));
  assert.ok(!JSON.stringify(events).includes("PRIVATE"));
  assert.ok(!events.some(e => e.action.includes("معطل")));
  assert.deepEqual(errors, []);
  console.log("PASS: desktop/mobile, pagination, search, filters, permission hiding, server denial, click tracking and secret exclusion.");
  console.log("Screenshots: " + artifacts);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
