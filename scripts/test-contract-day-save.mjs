import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const mocks={
  '/contexts/AuthContext.tsx': `export const useAuth=()=>({feat:()=>true});`,
  '/components/ui/toast.tsx': `export const useToast=()=>({showToast:(message)=>{window.lastToast=message}});`,
  '/lib/firebase.ts': `export const auth={currentUser:null};`,
  '/lib/firestore/contracts.ts': `export const getContractById=async()=>({id:'TEST',name:'عقد اختبار',status:'active',startDate:'2026-01-01',endDate:'2026-12-31',ledger:{defaultCustody:500},terms:[{barcode:'A',itemName:'عصير',unit:'حبة',unitPrice:2,openingQty:10}]});`,
  '/lib/firestore/costs.ts': `export const getCostItems=async()=>[{id:'A',name:'عصير',unit:'حبة'}];`,
  '/lib/firestore/sales.ts': `export const getSectionsOfChannel=async()=>[{id:'S',name:'قسم الاختبار'}];export const itemsOfSection=items=>items;`,
  '/lib/api.ts': `
const totals={sales:0,closingStock:0,soldQty:0,cost:0,expenses:0,profit:0,collected:0,variance:0};
export const api={get:async url=>{if(window.failLoad)throw new Error('اختبار فشل تحميل الأرصدة');const month=url.split('month=')[1];const all=JSON.parse(localStorage.getItem('days')||'[]');const openingStock={A:10};for(const d of all.filter(d=>d.date<month+'-01').sort((a,b)=>a.date.localeCompare(b.date)))for(const l of d.lines)openingStock[l.barcode]=l.remaining;return {month,openingStock,days:all.filter(d=>d.date.startsWith(month)),items:[],expenseLines:[],collections:{},totals,posted:false}},put:async(url,data)=>{
window.lastPayload=structuredClone(data);window.saveCalls=(window.saveCalls||0)+1;
await new Promise(r=>setTimeout(r,200));if(window.failSave)throw new Error('اختبار فشل الحفظ');
const days=JSON.parse(localStorage.getItem('days')||'[]');const day={...data,lines:data.lines.map(l=>({...l,itemName:'عصير',salePrice:2,openingQty:10,sold:10+l.supplied-l.damaged-l.remaining,revenue:2*(10+l.supplied-l.damaged-l.remaining)})),totals};
localStorage.setItem('days',JSON.stringify([...days.filter(d=>d.date!==data.date),day]));return{id:'TEST_'+data.date};},patch:async()=>{},post:async()=>{},del:async()=>{}};`,
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/(dashboard)/admin/contracts/[id]/page';import{NavigationGuardProvider}from '@/contexts/NavigationGuardContext';createRoot(document.getElementById('root')).render(<NavigationGuardProvider><Page/></NavigationGuardProvider>);`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'mock'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='navigation'?`const router={push:()=>{}};export const useRouter=()=>router;export const useParams=()=>({id:'TEST'});`:`export default function Link(){return null}`,loader:'tsx'}));b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/');const match=Object.keys(mocks).find(key=>path.endsWith(key));if(match)return{contents:mocks[match],loader:'tsx'};});}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{padding:24px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1280,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`);
await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]')&&!document.querySelector('[data-calendar-boundary] fieldset').disabled);
const set=async(selector,value)=>{await page.$eval(selector,e=>{e.focus();e.select()});await page.keyboard.press('Backspace');await page.keyboard.type(value);};
const button=async text=>page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click(),text);
const input='[data-calendar-boundary]';
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-12');
await page.waitForFunction(()=>!document.querySelector('[data-calendar-boundary] fieldset').disabled);
if(await page.$$eval(`${input} tbody input`,els=>els.length)===0)await page.select(`${input} select`,'S');
await set(`${input} tbody tr:first-child td:nth-child(5) input`,'15');
await set(`${input} tbody tr:first-child td:nth-child(6) input`,'1');
await set(`${input} tbody tr:first-child td:nth-child(7) input`,'7');
const amounts=[12.5,10,5,3,600,2,1,0,0,0.5];
// Collection/custody and expense inputs are in DOM order within the two-column block.
const amountSelector=`${input} .grid.grid-cols-1 input`;
assert.equal(await page.$$eval(amountSelector,els=>els.length),10);
for(let i=0;i<amounts.length;i++){const handle=(await page.$$(amountSelector))[i];await handle.focus();await handle.evaluate(e=>e.select());await page.keyboard.press('Backspace');await page.keyboard.type(String(amounts[i]));}
await button('حفظ اليوم');
await page.waitForFunction(()=>window.lastPayload);
assert.equal(await page.$eval('[aria-label="تاريخ يوم التشغيل"]',e=>e.disabled),true);
assert.equal(await page.$eval(`${input} fieldset`,e=>e.disabled),true);
await page.waitForFunction(()=>!document.querySelector('[data-calendar-boundary] fieldset').disabled);
const payload=await page.evaluate(()=>window.lastPayload);
assert.equal(payload.date,'2026-10-12');assert.deepEqual(payload.lines,[{barcode:'A',supplied:15,damaged:1,remaining:7}]);
assert.deepEqual(payload.collections,{bank_transfer:12.5,mada:10,visa:5,cash:3});assert.equal(payload.custody,600);assert.deepEqual(payload.expenses.map(e=>e.amount),[2,1,0,0,0.5]);
assert.equal(await page.$('[role="dialog"]'),null);
await page.reload();await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] fieldset')&&!document.querySelector('[data-calendar-boundary] fieldset').disabled);
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-12');
await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] tbody input')?.value==='15');
assert.deepEqual(await page.$$eval(amountSelector,els=>els.map(e=>e.value)),['12.5','10','5','3','600','2','1','','','0.5']);
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-11');await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] tbody input')?.value==='');const stored=await page.evaluate(()=>localStorage.getItem('days'));await button('اليوم التالي');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-10-12'&&document.querySelector('[data-calendar-boundary] tbody input')?.value==='15');assert.equal(await page.evaluate(()=>localStorage.getItem('days')),stored);
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-13');await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='7');
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-12');await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] tbody input')?.value==='15');
await page.select(`${input} select`,'S');
await set(`${input} tbody tr:first-child td:nth-child(5) input`,'16');await page.evaluate(()=>window.failSave=true);await button('حفظ اليوم');await page.waitForFunction(()=>window.lastToast==='اختبار فشل الحفظ');assert.equal(await page.$eval(`${input} tbody input`,e=>e.value),'16');
// The real navigation guard must block a failed save, and preserve the date/draft.
await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('حفظ اليوم والمغادرة');await page.waitForSelector('[role="alert"]');assert.equal(await page.$eval('[aria-label="تاريخ يوم التشغيل"]',e=>e.value),'2026-10-12');await button('البقاء في الصفحة');
await page.evaluate(()=>window.failSave=false);await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('حفظ اليوم والمغادرة');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-10-13'&&document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='7');
assert.equal(await page.$eval(`${input} tbody tr:first-child td:nth-child(4)`,e=>e.textContent),'7');
assert.equal(await page.$eval(`${input} tbody input`,e=>e.value),'');assert.equal(await page.$eval(`${input} select`,e=>e.value),'S');assert.deepEqual(await page.$$eval(amountSelector,els=>els.map(e=>e.value)),['','','','','500','','','','','']);
// A calendar gap uses day 12, not only yesterday, and no movement is copied.
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-20');await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='7');
// Zero is a real closing balance; next-day navigation retains the same zero-stock row.
await set(`${input} tbody tr:first-child td:nth-child(7) input`,'0');await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('حفظ اليوم والمغادرة');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-10-21'&&document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='0');assert.equal(await page.$$eval(`${input} tbody tr td:nth-child(7) input`,els=>els.length),1);
// Discard does not save the current draft nor invent a new day document.
const calls=await page.evaluate(()=>window.saveCalls);await set(`${input} tbody input`,'99');await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('المغادرة دون حفظ');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-10-22');assert.equal(await page.evaluate(()=>window.saveCalls),calls);
await set('[aria-label="تاريخ يوم التشغيل"]','2026-10-31');await page.waitForFunction(()=>!document.querySelector('[data-calendar-boundary] fieldset').disabled);await page.select(`${input} select`,'');await page.select(`${input} select`,'S');await set(`${input} tbody input`,'5');await set(`${input} tbody tr:first-child td:nth-child(7) input`,'3');await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('حفظ اليوم والمغادرة');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-11-01'&&document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='3');assert.equal(await page.$eval(`${input} tbody tr:first-child td:nth-child(4)`,e=>e.textContent),'3');assert.equal(await page.$eval(`${input} tbody input`,e=>e.value),'');
// A successful write followed by failed reload must not navigate with stale stock.
await set(`${input} tbody tr:first-child td:nth-child(7) input`,'2');await page.evaluate(()=>window.failLoad=true);await button('اليوم التالي');await page.waitForSelector('[role="dialog"]');await button('حفظ اليوم والمغادرة');await page.waitForFunction(()=>document.querySelector('[data-calendar-boundary] fieldset').disabled&&document.querySelector('[data-calendar-boundary] [role="alert"]'));assert.equal(await page.$eval('[aria-label="تاريخ يوم التشغيل"]',e=>e.value),'2026-11-01');await button('البقاء في الصفحة');await page.evaluate(()=>window.failLoad=false);await button('إعادة تحميل الأرصدة');await page.waitForFunction(()=>!document.querySelector('[data-calendar-boundary] fieldset').disabled);await button('اليوم التالي');await page.waitForFunction(()=>document.querySelector('[aria-label="تاريخ يوم التشغيل"]').value==='2026-11-02'&&document.querySelector('[data-calendar-boundary] tbody tr:first-child td:nth-child(7) input')?.value==='2');
await fs.mkdir('tmp/contract-day-save',{recursive:true});
for(const width of [1280,390]){await page.setViewport({width,height:1000});await page.$eval('[aria-label="تاريخ يوم التشغيل"]',e=>e.parentElement.querySelector('button').click());await page.waitForSelector('[aria-label="اختيار التاريخ"]');const bounds=await page.evaluate(()=>{const c=document.querySelector('[data-calendar-boundary]').getBoundingClientRect(),p=document.querySelector('[aria-label="اختيار التاريخ"]').getBoundingClientRect();return{left:p.left-c.left,right:c.right-p.right}});assert.ok(bounds.left>=7&&bounds.right>=7,JSON.stringify(bounds));await page.screenshot({path:`tmp/contract-day-save/${width}.png`});await page.$eval('[aria-label="تاريخ يوم التشغيل"]',e=>e.parentElement.querySelector('button').click());}
assert.deepEqual(errors,[]);console.log('PASS: actual page + real navigation guard: gap carry, next day, save/stay/discard/failure, same section and zero-stock items, month boundary, cleared movements, reload and desktop/mobile layout.');
}catch(error){const pages=await browser.pages();console.error(await pages.at(-1).evaluate(()=>({date:document.querySelector('[aria-label="تاريخ يوم التشغيل"]')?.value,rows:[...document.querySelectorAll('[data-calendar-boundary] tbody input')].map(e=>e.value),dialog:document.querySelector('[role="dialog"]')?.textContent,toast:window.lastToast,payload:window.lastPayload,errors:document.body.innerText.slice(-1800)})));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
