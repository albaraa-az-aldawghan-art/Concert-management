import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const mocks={
  '/contexts/AuthContext.tsx': `export const useAuth=()=>({appUser:{role:'admin'},can:()=>true,feat:()=>true});`,
  '/components/ui/toast.tsx': `export const useToast=()=>({showToast:(message)=>{window.lastToast=message}});`,
  '/components/ui/actor.tsx': `export const Actor=()=>null;`,
  '/components/ui/camera-scan-modal.tsx': `export const CameraScanModal=()=>null;`,
  '/lib/firestore/costs.ts': `
window.savedSuppliers=['المورد القديم'];window.invoice=null;
export const getCostIncoming=async()=>[];
export const getCostItems=async()=>[{id:'RAW',name:'أرز خام',kind:'raw',unit:'كجم',purchaseUnit:'كيس',purchaseToIssue:10},{id:'LEGACY',name:'ملح قديم',unit:'جم'},{id:'SALE',name:'منتج بيع',kind:'sale',unit:'حبة'},{id:'PRODUCED',name:'منتج مصنع',kind:'produced',unit:'حبة'}];
export const getPurchaseSuppliers=async()=>window.savedSuppliers;
export const addPurchaseSupplier=async name=>{window.savedSuppliers.push(name.trim());return name.trim()};
export const addCostIncomingInvoice=async data=>{window.invoice=data};
export const deleteCostIncoming=async()=>{};export const itemBalance=()=>0;
`,
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/(dashboard)/admin/costs/incoming/page';createRoot(document.getElementById('root')).render(<Page/>);`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'test-mocks',setup(b){b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/');const match=Object.keys(mocks).find(key=>path.endsWith(key));if(match)return{contents:mocks[match],loader:'tsx'};});}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const click=async text=>page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click(),text);
await page.setViewport({width:1280,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);await click('فاتورة شراء جديدة');await page.waitForFunction(()=>document.querySelector('#اسم-المورد')?.options.length===2);
await page.select('#اسم-المورد','المورد القديم');
await click('إضافة مورد جديد');await page.type('#اسم-المورد-الجديد','مورد جديد');await click('حفظ المورد');await page.waitForFunction(()=>document.querySelector('#اسم-المورد').value==='مورد جديد');
await page.type('[aria-label="بحث عن مورد"]','القديم');assert.deepEqual(await page.$$eval('#اسم-المورد option',nodes=>nodes.map(n=>n.value)),['','المورد القديم','مورد جديد']);
await click('اختيار من القائمة');
const names=await page.$$eval('button p.text-sm',nodes=>nodes.map(n=>n.textContent));assert.ok(names.includes('أرز خام'));assert.ok(names.includes('ملح قديم'));assert.ok(!names.includes('منتج بيع'));assert.ok(!names.includes('منتج مصنع'));
await click('مسح الباركود');await page.type('input[placeholder="امسح الباركود هنا…"]','PRODUCED');await page.keyboard.press('Enter');assert.match(await page.evaluate(()=>window.lastToast),/مادة خام/);assert.equal(await page.$('[aria-label="كمية منتج مصنع"]'),null);
await page.type('input[placeholder="امسح الباركود هنا…"]','RAW');await page.keyboard.press('Enter');await page.waitForSelector('[aria-label="كمية أرز خام"]');await page.type('[aria-label="كمية أرز خام"]','2');await page.type('[aria-label="سعر أرز خام"]','120');
await click('حفظ فاتورة الشراء');await page.waitForFunction(()=>window.invoice!==null);
const invoice=await page.evaluate(()=>window.invoice);assert.equal(invoice.supplierName,'مورد جديد');assert.deepEqual(invoice.lines,[{itemBarcode:'RAW',quantity:2,priceBeforeVat:120}]);
await click('فاتورة شراء جديدة');await page.waitForFunction(()=>document.querySelector('#اسم-المورد')?.options.length===3);
await fs.mkdir('tmp/purchase-invoice',{recursive:true});for(const width of [1280,390]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`tmp/purchase-invoice/${width}.png`});}
assert.deepEqual(errors,[]);console.log('PASS: saved supplier selection/search/creation/reopen; raw and legacy list; non-raw barcode rejected; raw invoice payload and mobile layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
