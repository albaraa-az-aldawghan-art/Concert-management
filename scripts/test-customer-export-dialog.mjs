import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import puppeteer from 'puppeteer-core';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CustomerExportDialog} from '@/components/customer-export-dialog';
function App(){
 const [open,setOpen]=useState(true),[ids,setIds]=useState(['c-1']),[search,setSearch]=useState('');
 const customers=Array.from({length:45},(_,i)=>({id:'c-'+i,name:'عميل '+i,primaryPhone:'050000'+String(i).padStart(4,'0')}));
 window.values={open,ids,search};
 return <><button id="reopen" onClick={()=>setOpen(true)}>فتح</button><CustomerExportDialog open={open} onClose={()=>setOpen(false)} customers={customers} selectedIds={ids} setSelectedIds={setIds} search={search} setSearch={setSearch} exporting={false} onExport={()=>window.exported=[...ids]}/></>;
}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar-SA" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const width of [1280,390]){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port);
 const search='[aria-label="بحث عن العملاء في التصدير"]';await page.waitForSelector(search);
 await page.type(search,'عميل 44');assert.equal(await page.$$eval('input[type="checkbox"]',nodes=>nodes.length),1);
 assert.deepEqual(await page.evaluate(()=>window.values.ids),['c-1']);
 await page.click('input[type="checkbox"]');assert.deepEqual(await page.evaluate(()=>window.values.ids),['c-1','c-44']);
 await page.mouse.click(3,3);await page.waitForSelector('[role="alertdialog"]');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='البقاء').click());
 assert.equal(await page.evaluate(()=>window.values.search),'عميل 44');assert.deepEqual(await page.evaluate(()=>window.values.ids),['c-1','c-44']);
 await page.click('[aria-label="إغلاق"]');await page.waitForSelector('[role="alertdialog"]');await page.keyboard.press('Escape');
 assert.equal(await page.$('[role="alertdialog"]'),null);assert.equal(await page.evaluate(()=>window.values.open),true);
 await page.keyboard.press('Escape');await page.waitForSelector('[role="alertdialog"]');
 await fs.mkdir('tmp/customer-export-dialog',{recursive:true});await page.screenshot({path:'tmp/customer-export-dialog/prompt-'+width+'.png'});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='البقاء').click());
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='تحديد نتائج البحث فقط').click());
 assert.deepEqual(await page.evaluate(()=>window.values.ids),['c-44']);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('تنزيل كشف الحساب')).click());
 assert.deepEqual(await page.evaluate(()=>window.exported),['c-44']);
 await page.click('[aria-label="مسح بحث التصدير"]');assert.equal(await page.$$eval('input[type="checkbox"]',nodes=>nodes.length),45);
 assert.deepEqual(await page.evaluate(()=>window.values.ids),['c-44']);
 await page.screenshot({path:'tmp/customer-export-dialog/search-'+width+'.png'});
 await page.mouse.click(3,3);await page.waitForSelector('[role="alertdialog"]');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='المغادرة').click());
 assert.equal(await page.evaluate(()=>window.values.open),false);assert.equal(await page.$(search),null);
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: desktop/mobile customer search across 45 customers, preserved selection, search-only selection, export IDs, outside/X/Escape stay/leave confirmation.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
