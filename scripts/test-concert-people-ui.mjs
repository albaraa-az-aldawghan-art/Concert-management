import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const mocks = {
  '/contexts/AuthContext.tsx': `export const useAuth=()=>({feat:(page)=>page==='finances'&&new URLSearchParams(location.search).get('finance')==='yes'});`,
  '/lib/firestore/concerts.ts': `import {Timestamp} from 'firebase/firestore';export const getCachedConcerts=async()=>[];export const deleteConcert=async()=>{throw new Error('No deletion allowed in this test')};export const getConcerts=async()=>Array.from({length:12},(_,i)=>({id:String(i+1),concertNumber:i+1,name:'حفلة اختبار '+(i+1),clientName:'عميل '+(i+1),date:Timestamp.fromDate(new Date('2026-10-'+String(i+1).padStart(2,'0')+'T12:00:00Z')),venueName:'قاعة الاختبار',status:'confirmed',price:1000,deposit:100,peopleCount:['١٥٠/١٧٠','170','',0,'۱۲۰','1,250'][i%6]}));`,
  '/components/ui/toast.tsx': `export const useToast=()=>({showToast:()=>{}});`,
  '/components/ui/export-dialog.tsx': `export const ExportDialog=()=>null;`,
};
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import Page from'@/app/(dashboard)/admin/concerts/page';createRoot(document.getElementById('root')).render(<Page/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default function Link({children,...props}){return <a {...props}>{children}</a>}',loader:'tsx',resolveDir:process.cwd()}));
  b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/'),key=Object.keys(mocks).find(k=>path.endsWith(k));if(key)return{contents:mocks[key],loader:'tsx'};});
}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root" style="padding:16px"></div><script>${bundle.outputFiles[0].text}</script></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await fs.mkdir('tmp/concert-people',{recursive:true});
  for(const width of [1280,1024,390]) for(const finance of ['yes','no']) {
    await page.setViewport({width,height:1000});
    await page.goto(`http://127.0.0.1:${server.address().port}/?finance=${finance}`);
    await page.waitForSelector('[aria-label="عدد الأشخاص: 150/170"]',{timeout:5000}).catch(async error=>{console.error(errors,await page.evaluate(()=>document.body.innerText));throw error;});
    const visible=await page.$$eval('[aria-label^="عدد الأشخاص:"]',els=>els.filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label')));
    assert.equal(visible.length,10);
    for(const label of ['150/170','170','غير محدد','0','120','1,250']) assert.ok(visible.includes('عدد الأشخاص: '+label),label);
    assert.ok(visible.every(v=>!/[٠-٩۰-۹]/.test(v)));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No page overflow');
    if(width>=640) assert.equal(await page.$eval('table',t=>t.scrollWidth>t.parentElement.clientWidth),false,'No new horizontal table scroll');
    await page.screenshot({path:`tmp/concert-people/${width}-${finance}.png`,fullPage:true});
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('التالي')).click());
    await page.waitForFunction(()=>document.body.innerText.includes('حفلة اختبار 12'));
    assert.equal(await page.$$eval('[aria-label^="عدد الأشخاص:"]',els=>els.filter(e=>e.getClientRects().length).length),2);
    await page.type('input[placeholder^="بحث بالرقم"]','حفلة اختبار 5');
    await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1);
    assert.equal(await page.$$eval('[aria-label^="عدد الأشخاص:"]',els=>els.filter(e=>e.getClientRects().length).map(e=>e.getAttribute('aria-label'))).then(v=>v[0]),'عدد الأشخاص: 120');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: actual concerts page; desktop/tablet/mobile; finance permissions; English digits; ranges, blank, zero, separators; pagination and global search; no horizontal overflow.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
