import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import puppeteer from 'puppeteer-core';
const mocks = {
  '/lib/firebase.ts': `export const auth={currentUser:{getIdToken:async()=>'TEST'}};`,
  '/lib/download-file.ts': `export const downloadBlob=(blob,filename)=>window.download={size:blob.size,type:blob.type,filename};`,
};
const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ExpensesExportDialog}from'@/components/ui/expenses-export-dialog';createRoot(document.getElementById('root')).render(<ExpensesExportDialog onClose={()=>{window.closedDialog=true}}/>);` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture', setup(b) {
  b.onLoad({ filter: /\.(ts|tsx)$/ }, args => { const path = args.path.replaceAll('\\', '/'), key = Object.keys(mocks).find(k => path.endsWith(k)); if (key) return { loader: 'tsx', contents: mocks[key] }; });
} }] });
const css = await postcss([tailwind()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: process.cwd() + '/app/globals.css' });
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.calls=[];window.fetch=async(path,opts)=>{window.calls.push({path,...opts});if(window.fail)return new Response(JSON.stringify({error:'إجمالي يوم التشغيل لا يطابق تفاصيله'}),{status:400,headers:{'Content-Type':'application/json'}});return new Response('FIXTURE-XLSX',{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}})}</script><script>${built.outputFiles[0].text}</script></html>`); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  const click = async text => { await page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t) && !b.disabled).click(), text); };
  async function setDates(from, to) { await page.evaluate(({ from, to }) => {
    const inputs = [...document.querySelectorAll('input')];
    for (const [index, value] of [[0, from], [1, to]]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[index], value); inputs[index].dispatchEvent(new Event('input', { bubbles: true })); }
  }, { from, to }); }
  await fs.mkdir('tmp/expenses-export', { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 940 }); await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('input');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
    await page.screenshot({ path: `tmp/expenses-export/dialog-${width}.png` });
    await setDates('2026-11-22', '2026-11-21'); await click('تنزيل ملف'); await page.waitForSelector('[role="alert"]'); assert.equal(await page.evaluate(() => window.calls.length), 0);
    await setDates('2026-11-20', '2026-11-21'); await page.evaluate(() => { window.fail = true; }); await click('تنزيل ملف'); await page.waitForFunction(() => document.querySelector('[role="alert"]').textContent.includes('لا يطابق'));
    assert.equal(await page.evaluate(() => window.download), undefined);
    await page.evaluate(() => { window.fail = false; }); await click('تنزيل ملف'); await page.waitForFunction(() => !!window.download);
    const request = await page.evaluate(() => window.calls.at(-1));
    assert.deepEqual(JSON.parse(request.body), { filters: { from: '2026-11-20', to: '2026-11-21' } });
    assert.equal(request.headers.Authorization, 'Bearer TEST'); assert.equal(await page.evaluate(() => window.download.filename), 'جميع-المصاريف.xlsx');
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('input'); await click('تنزيل ملف'); await page.waitForFunction(() => !!window.download);
    assert.deepEqual(await page.evaluate(() => JSON.parse(window.calls[0].body).filters), { from: '', to: '' });
    await page.click('[aria-label="إغلاق"]'); await page.waitForSelector('[role="alertdialog"]'); await click('البقاء'); assert.equal(await page.$('[role="alertdialog"]'), null);
  }
  assert.deepEqual(errors, []); console.log('Expense export dialog: desktop/mobile, no horizontal overflow, all-time default, date period, error display, download, token and exit confirmation passed.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
