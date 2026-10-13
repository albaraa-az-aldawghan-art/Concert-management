import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const mocks={
 '/contexts/AuthContext.tsx': `import{useState}from'react';export function useAuth(){const[mode,setMode]=useState(new URLSearchParams(location.search).get('mode'));window.setMode=setMode;return{appUser:{role:mode==='admin'?'admin':'employee'},can:p=>p==='costs'&&mode!=='blocked',feat:(p,k)=>p==='costs'&&(k==='in_view'||k==='in_delete'&&mode==='granted')}}`,
 '/components/ui/toast.tsx': `export const useToast=()=>({showToast:message=>{window.lastToast=message}});`,
 '/components/ui/actor.tsx': `export const Actor=()=>null;`,
 '/components/ui/camera-scan-modal.tsx': `export const CameraScanModal=()=>null;`,
 '/lib/firestore/costs.ts': `window.entries=[{id:'IN',itemName:'أرز مصري',itemBarcode:'RICE',quantity:12.5,unit:'كجم',priceBeforeVat:10,totalBeforeVat:125,invoiceDate:'2026-10-13'}];export const getCostIncoming=async()=>{window.reads=(window.reads||0)+1;return[...window.entries]};export const getCostItems=async()=>[];export const getPurchaseSuppliers=async()=>[];export const addPurchaseSupplier=async name=>name;export const addCostIncomingInvoice=async()=>{};export const deleteCostIncoming=async entry=>{window.deletes=(window.deletes||0)+1;if(window.failDelete)throw Error('فشل اختبار الحذف');window.entries=window.entries.filter(e=>e.id!==entry.id)};`,
};
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/(dashboard)/admin/costs/incoming/page';createRoot(document.getElementById('root')).render(<Page/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/'),key=Object.keys(mocks).find(k=>path.endsWith(k));if(key)return{contents:mocks[key],loader:'tsx'};});}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${result.outputFiles[0].text}</script></html>`)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const click=async text=>page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click(),text);
for(const width of [1280,390])for(const mode of ['blocked','viewer','granted','admin']){
 await page.setViewport({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
 if(mode==='blocked'){await page.waitForFunction(()=>document.body.innerText.includes('غير مصرح'));assert.equal(await page.evaluate(()=>window.reads||0),0);continue;}
 await page.waitForFunction(()=>document.body.innerText.includes('أرز مصري'));
 if(mode==='viewer'){assert.equal(await page.$('[aria-label="حذف وارد أرز مصري"]'),null);continue;}
 await page.click('[aria-label="حذف وارد أرز مصري"]');await page.waitForFunction(()=>document.body.innerText.includes('حذف عملية الوارد'));assert.ok((await page.evaluate(()=>document.body.innerText)).includes('12.5'));
 await click('إلغاء');assert.equal(await page.evaluate(()=>window.deletes||0),0);
 if(mode==='granted'){
  await page.click('[aria-label="حذف وارد أرز مصري"]');await page.evaluate(()=>window.setMode('viewer'));await page.waitForFunction(()=>!document.body.innerText.includes('حذف عملية الوارد'));assert.equal(await page.evaluate(()=>window.deletes||0),0);await page.evaluate(()=>window.setMode('granted'));
  await page.waitForFunction(()=>document.body.innerText.includes('حذف عملية الوارد'));await page.evaluate(()=>window.failDelete=true);await click('حذف');await page.waitForFunction(()=>window.lastToast==='فشل اختبار الحذف');assert.equal(await page.evaluate(()=>window.entries.length),1);await page.evaluate(()=>window.failDelete=false);
 }else await page.click('[aria-label="حذف وارد أرز مصري"]');
 await click('حذف');await page.waitForFunction(()=>window.entries.length===0&&!document.body.innerText.includes('حذف عملية الوارد'));assert.ok((await page.evaluate(()=>document.body.innerText)).includes('لا توجد عمليات وارد'));
}
assert.deepEqual(errors,[]);console.log('PASS: actual incoming page at desktop/mobile; employee granted access; hidden delete for view-only; cancel preserves data; revoked permission hides open dialog; failure preserves record; confirmed deletion refreshes list.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
