import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const record={id:'phone_TEST',name:'عميل الاختبار',primaryPhone:'0500000000',secondaryPhone:null,source:'مصدر سري',referralName:'شخص سري',notes:'ملاحظة سرية',firstRegisteredAt:'2026-10-01',firstCreatedBy:'uid-secret',firstCreatedByName:'موظف سري',lastConcertAt:'2026-10-12',concertCount:1,completedCount:0,cancelledCount:0,upcomingCount:1,totalValue:12345,totalCollected:100,totalRemaining:12245,totalRefunded:0,concerts:[{id:'c1',concertNumber:1,date:'2026-10-12',createdAt:'2026-10-01',venueName:'قاعة الاختبار',status:'confirmed',price:12345,paid:100,remaining:12245}],payments:[{id:'p1',concertNumber:1,amount:100,method:'cash',date:'2026-10-01',createdByName:'موظف سري'}]};
const mocks={
 '/contexts/AuthContext.tsx': `const mode=new URLSearchParams(location.search).get('mode');const keys=mode==='full'?['financial','payments','source','notes','activity','edit','export']:mode==='editor'?['edit']:mode==='finance'?['financial']:[];export const useAuth=()=>({can:p=>p==='customers'&&mode!=='blocked',feat:(p,k)=>p==='customers'&&keys.includes(k)});`,
 '/lib/firestore/customers.ts': `export const getConcertCustomers=async()=>{window.customerReads=(window.customerReads||0)+1;return[${JSON.stringify(record)}]};export const saveConcertCustomer=async()=>{};`,
 '/components/ui/toast.tsx': `export const useToast=()=>({showToast:()=>{}});`,
 '/lib/firebase.ts': `export const auth={currentUser:null};`,
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/(dashboard)/admin/customers/page';createRoot(document.getElementById('root')).render(<Page/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default function Link(){return null}',loader:'js'}));b.onLoad({filter:/\.(tsx|ts)$/},args=>{const path=args.path.replaceAll('\\','/'),key=Object.keys(mocks).find(k=>path.endsWith(k));if(key)return{contents:mocks[key],loader:'tsx'};});}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const width of [1280,390])for(const mode of ['blocked','basic','finance','editor','full']){
 await page.setViewport({width,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
 if(mode==='blocked'){await page.waitForFunction(()=>document.body.innerText.includes('لا تملك صلاحية'));assert.equal(await page.evaluate(()=>window.customerReads||0),0);continue;}
 await page.waitForFunction(()=>document.body.innerText.includes('عميل الاختبار'));
 const text=await page.evaluate(()=>document.body.innerText),buttons=await page.$$eval('button',els=>els.map(e=>e.textContent));
 assert.equal(text.includes('12,345'),mode==='finance'||mode==='full');
 assert.equal(text.includes('مصدر سري'),mode==='editor'||mode==='full');
 assert.equal(text.includes('موظف سري'),mode==='full');
 assert.equal(buttons.some(t=>t.includes('تعديل بيانات العميل')),mode==='editor'||mode==='full');
 assert.equal(buttons.some(t=>t.includes('تصدير كشف حساب PDF')),mode==='full');
 assert.equal(buttons.some(t=>t.includes('الدفعات (')),mode==='full');
 assert.equal(buttons.some(t=>t.includes('ملاحظات العميل')),mode==='editor'||mode==='full');
 assert.equal(await page.$('a[href="/admin/concerts/c1"]'),null);
 if(mode==='full'){await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('الدفعات (')).click());assert.ok((await page.evaluate(()=>document.body.innerText)).includes('نقد'));}
 if(mode==='basic'){await fs.mkdir('tmp/customer-permissions',{recursive:true});await page.screenshot({path:`tmp/customer-permissions/${width}.png`});}
}
assert.deepEqual(errors,[]);console.log('PASS: actual customers page for denied/basic/financial/editor/full employee roles at desktop/mobile; hidden financial fields, source, staff, tabs, actions and concert links.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
