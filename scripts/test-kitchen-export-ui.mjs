import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const mocks={
 '/contexts/AuthContext.tsx':`const mode=new URLSearchParams(location.search).get('mode');export const useAuth=()=>({appUser:{role:'kitchen'},can:()=>mode!=='blocked',feat:(p,k)=>k==='export'&&mode==='granted'});`,
 '/lib/firestore/kitchen.ts':`import{Timestamp}from'firebase/firestore';export const getKitchenOrders=async()=>{window.reads=(window.reads||0)+1;return[...Array.from({length:25},(_,i)=>({id:String(i+1),concertId:String(i+1),concertNumber:i+1,clientName:'عميل '+(i+1),concertDate:Timestamp.fromDate(new Date('2026-10-13T12:00:00Z')),status:'received'})),{id:'future',concertId:'future',concertNumber:50,clientName:'خارج الأسبوع',concertDate:Timestamp.fromDate(new Date('2026-10-28T12:00:00Z')),status:'received'},{id:'sent',concertId:'sent',concertNumber:99,clientName:'عبد الرحمن الموسى',concertDate:Timestamp.fromDate(new Date('2026-10-13T12:00:00Z')),status:'sent'}]};export const confirmKitchenOrder=async()=>{throw Error('must not confirm')};`,
 '/components/ui/toast.tsx':`export const useToast=()=>({showToast:(message,type)=>{window.lastToast={message,type}}});`,
 '/lib/firebase.ts':`export const auth={currentUser:{getIdToken:async()=>'TEST'}};`,
 '/lib/download-file.ts':`export const downloadBlob=(blob,name)=>{window.downloadName=name};`,
};
const contents=`import React from'react';import{createRoot}from'react-dom/client';import Page from'@/app/(dashboard)/kitchen/page';
const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-13T12:00:00Z']))}static now(){return new OriginalDate('2026-10-13T12:00:00Z').getTime()}};
window.requests=[];window.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);window.requests.push(body);window.payload=body;
if(body.preview){const candidates=body.orderIds.map(id=>({id,name:id==='sent'?'عبد الرحمن الموسى':'حفلة '+id,categories:id==='sent'?['الأطباق الرئيسية']:['المقبلات الباردة','الأطباق الرئيسية'],...(id==='2'?{notice:{id,name:'حفلة 2',code:'cancelled',reason:'الحفلة ملغاة'}}:{})}));return Response.json({candidates,notices:candidates.filter(c=>c.notice).map(c=>c.notice),includedCount:candidates.filter(c=>!c.notice).length});}
return new Response(new Blob(['TEST']),{status:200,headers:{'X-Kitchen-Unspecified-Lines':String(window.unknown||0),'X-Kitchen-Skipped-Orders':'1'}})};
createRoot(document.getElementById('root')).render(<Page/>);`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default function Link(){return null}',loader:'js'}));b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/'),key=Object.keys(mocks).find(k=>path.endsWith(k));if(key)return{contents:mocks[key],loader:'tsx'};});}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=async text=>page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click(),text);
 for(const width of[1280,390])for(const mode of['blocked','viewer','granted']){
  await page.setViewport({width,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
  if(mode==='blocked'){await page.waitForFunction(()=>document.body.innerText.includes('غير مصرح'));assert.equal(await page.evaluate(()=>window.reads||0),0);continue;}
  await page.waitForFunction(()=>document.body.innerText.includes('عميل 1'));
  if(mode==='viewer'){assert.equal(await page.$$eval('button',els=>els.some(e=>e.textContent.includes('تصدير تجميع'))),false);continue;}
  await click('هذا الأسبوع');await click('تصدير تجميع');await page.waitForSelector('[aria-label="قسم المقبلات الباردة"]');
  assert.equal(await page.$$eval('[aria-label^="اختيار الحفلة"]',els=>els.length),26);
  assert.ok(await page.$('[aria-label="اختيار الحفلة 99"]'));assert.equal(await page.$('[aria-label="اختيار الحفلة 50"]'),null);
  await click('إلغاء اختيار الأقسام');assert.equal(await page.$$eval('button',els=>els.find(e=>e.textContent.includes('تنزيل PDF')).disabled),true);
  await page.click('[aria-label="قسم المقبلات الباردة"]');
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('ليست حفلة فارغة')));
  await click('كل الأقسام');await click('إلغاء التحديد');await page.click('[aria-label="اختيار الحفلة 99"]');await page.click('[aria-label="اختيار الحفلة 25"]');await page.click('[aria-label="اختيار الحفلة 2"]');
  await fs.mkdir('tmp/kitchen-export',{recursive:true});await page.screenshot({path:`tmp/kitchen-export/ui-${width}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await click('تنزيل PDF');await page.waitForFunction(()=>window.downloadName);
  let data=await page.evaluate(()=>window.payload);assert.deepEqual(data.orderIds,['sent','25','2']);assert.equal(data.format,'pdf');assert.equal(data.preview,undefined);
  assert.deepEqual(data.filters.date,{mode:'custom',from:'2026-10-11',to:'2026-10-17'});assert.match(await page.evaluate(()=>window.downloadName),/\.pdf$/);
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('تنبيهات آخر فحص')));
  await page.evaluate(()=>{window.downloadName=null;window.unknown=2});
  await click('تصدير تجميع');await page.waitForSelector('[aria-label="قسم المقبلات الباردة"]');
  await click('إلغاء اختيار الأقسام');await page.click('[aria-label="قسم المقبلات الباردة"]');await click('تنزيل PDF');await page.waitForFunction(()=>window.downloadName);
  data=await page.evaluate(()=>window.payload);assert.deepEqual(data.filters.categories,['المقبلات الباردة']);assert.equal(await page.evaluate(()=>window.lastToast.type),'warning');
  await click('بانتظار الاستلام');assert.equal(await page.$$eval('button',els=>els.find(e=>e.textContent.includes('تصدير تجميع')).disabled),false);
 }
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile permissions; 26 matching events across pages including pending; category multiselect and no-category guard; date+category payload; outside notices; no confirmation or page overflow.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
