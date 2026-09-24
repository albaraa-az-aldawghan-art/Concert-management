// Browser-level checks for the real navigation guard with isolated actions.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "concert-navigation-guard-"));
const mocks = {
  "next/navigation": `export const useRouter = () => ({
    push: (href) => { window.__navigations.push(href); history.pushState({}, "", href); },
  });`,
};
const bundle = await build({
  stdin: { contents: `
    import React, { useLayoutEffect, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { NavigationGuardProvider, useNavigationGuard } from "@/contexts/NavigationGuardContext";
    window.__navigations = []; window.__saved = 0; window.__discarded = 0;
    function Harness() {
      const guard = useNavigationGuard();
      const [dirty, setDirty] = useState(false);
      const [hasDraft, setHasDraft] = useState(false);
      const [failSave, setFailSave] = useState(false);
      useLayoutEffect(() => guard.register({
        dirty, busy: false, hasDraft,
        save: async () => { window.__saved++; return !failSave; },
        discard: async () => { window.__discarded++; },
      }));
      return <main>
        <button id="dirty" onClick={() => setDirty(true)}>بدأت الكتابة</button>
        <button id="clean" onClick={() => setDirty(false)}>تم الحفظ</button>
        <button id="draft" onClick={() => setHasDraft(true)}>مسودة موجودة</button>
        <button id="fail" onClick={() => setFailSave(true)}>فشل الحفظ</button>
        <button id="programmatic" onClick={() => guard.request(() => window.__navigations.push("programmatic"))}>إلغاء</button>
        <a id="link" href="/concerts">الحفلات</a>
      </main>;
    }
    createRoot(document.getElementById("root")).render(<NavigationGuardProvider><Harness /></NavigationGuardProvider>);
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "navigation-mocks", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
  } }],
});
const css = await postcss([tailwind()]).process(await fs.readFile("app/globals.css", "utf8"), { from: path.join(root, "app/globals.css") });
const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
  if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css.css); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/new`);

  // Blank/clean form leaves immediately without a prompt.
  await page.click("#programmatic");
  assert.deepEqual(await page.evaluate(() => window.__navigations), ["programmatic"]);

  // Any entered data blocks navigation, and staying preserves the page.
  await page.click("#dirty");
  await page.click("#link");
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', (node) => node.textContent), /حفظ الحفلة قبل المغادرة/);
  await page.screenshot({ path: path.join(artifacts, "mobile-dialog.png") });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "البقاء في الصفحة").click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(new URL(page.url()).pathname, "/new");

  // Failed save keeps the user on the page and explains the failure.
  await page.click("#fail");
  await page.click("#link");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("حفظ في المسودات")).click());
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.$eval('[role="alert"]', (node) => node.textContent), /لم تُحفظ المسودة/);
  assert.equal(new URL(page.url()).pathname, "/new");

  // Discard works for in-memory data and changes wording for an existing draft.
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "البقاء في الصفحة").click());
  await page.click("#draft");
  await page.click("#link");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes("حذف المسودة والمغادرة"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "حذف المسودة والمغادرة").click());
  await page.waitForFunction(() => location.pathname === "/concerts");
  assert.equal(await page.evaluate(() => window.__discarded), 1);

  // Back navigation is restored until the user resolves the dialog.
  await page.click("#clean");
  await page.goto(`http://127.0.0.1:${server.address().port}/first`);
  await page.evaluate(() => history.pushState({}, "", "/new"));
  await page.click("#dirty");
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 500 }).catch(() => {});
  await page.waitForSelector('[role="dialog"]');
  assert.equal(new URL(page.url()).pathname, "/new");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("حذف البيانات")).click());
  await page.waitForFunction(() => location.pathname === "/first");

  // Refresh/close gets the browser-native beforeunload guard.
  await page.click("#clean");
  await page.goto(`http://127.0.0.1:${server.address().port}/new`);
  await page.click("#dirty");
  let beforeUnloadSeen = false;
  page.once("dialog", async (dialog) => { beforeUnloadSeen = dialog.type() === "beforeunload"; await dialog.dismiss(); });
  await page.reload({ timeout: 1000 }).catch(() => {});
  assert.equal(beforeUnloadSeen, true);
  assert.equal(new URL(page.url()).pathname, "/new");
  assert.deepEqual(errors, []);
  console.log("PASS: clean exit, link blocking, stay, save failure, draft deletion, browser back and beforeunload.");
  console.log("Screenshot: " + artifacts);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
