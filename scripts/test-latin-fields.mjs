import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LatinInput} from '@/components/ui/latin-input';
import {LatinNumeralsGuard} from '@/components/latin-numerals-guard';
function App(){
 const [number,setNumber]=useState('\\u0661\\u0662\\u0664');
 const [date,setDate]=useState('2026-10-08');
 const [month,setMonth]=useState('2026-10');
 const [datetime,setDatetime]=useState('2026-10-08T13:45');
 window.values={number,date,month,datetime};
 return <main><LatinNumeralsGuard/><form>
 <LatinInput id="number" type="number" min="0" step="0.01" value={number} onChange={e=>setNumber(e.target.value)}/>
 <LatinInput id="date" type="date" min="2026-10-01" value={date} onChange={e=>setDate(e.target.value)}/>
 <LatinInput id="month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
 <LatinInput id="datetime" type="datetime-local" value={datetime} onChange={e=>setDatetime(e.target.value)}/>
 </form></main>;
}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar-SA" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.css+' main{padding:24px} form{display:grid;gap:16px}input{border:1px solid #ddd;border-radius:8px;padding:12px;width:100%}</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const session=await page.createCDPSession();await session.send('Emulation.setLocaleOverride',{locale:'ar-SA'});
 await page.setViewport({width:390,height:844});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#number');
 assert.equal(await page.$eval('#number',e=>e.value),'124');
 assert.equal(await page.$eval('#date',e=>e.type),'text');
 await page.$eval('#number',e=>{e.focus();e.select();});await page.keyboard.press('Backspace');await page.keyboard.type('12.5');
 assert.equal(await page.evaluate(()=>window.values.number),'12.5');
 assert.equal(await page.$eval('#number',e=>e.checkValidity()),true);
 await page.$eval('#number',e=>e.select());await page.keyboard.press('Backspace');
 await page.$eval('#number',e=>e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,data:'\u0667\u0667\u0669',inputType:'insertText'})));
 assert.equal(await page.evaluate(()=>window.values.number),'779');
 await page.$eval('#number',e=>{e.focus();e.select();});await page.keyboard.type('-1');assert.equal(await page.$eval('#number',e=>e.checkValidity()),false);
 await page.$eval('#date',e=>{e.focus();e.select();});await page.keyboard.type('2026-10-');
 assert.equal(await page.evaluate(()=>window.values.date),'2026-10-08');
 await page.keyboard.type('09');assert.equal(await page.evaluate(()=>window.values.date),'2026-10-09');
 await page.$eval('#date',e=>e.parentElement.querySelector('button').click());await page.click('[aria-label="2026-10-10"]');
 assert.equal(await page.evaluate(()=>window.values.date),'2026-10-10');
 await page.$eval('#month',e=>e.parentElement.querySelector('button').click());await page.click('[aria-label="2026-11"]');
 assert.equal(await page.evaluate(()=>window.values.month),'2026-11');
 await page.$eval('#datetime',e=>e.parentElement.querySelector('button').click());await page.click('[aria-label="2026-10-10T13:45"]');
 assert.equal(await page.evaluate(()=>window.values.datetime),'2026-10-10T13:45');
 await page.$eval('[aria-label="وقت الحفلة HH:mm"]',e=>{e.focus();e.select();});await page.keyboard.type('14:30');
 assert.equal(await page.evaluate(()=>window.values.datetime),'2026-10-10T14:30');
 await page.$eval('#date',e=>e.parentElement.querySelector('button').click());
 await fs.mkdir('tmp/latin-fields',{recursive:true});
 await page.screenshot({path:'tmp/latin-fields/mobile.png'});
 await page.setViewport({width:1280,height:800});await page.screenshot({path:'tmp/latin-fields/desktop.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: Arabic browser locale, Latin digits, Arabic keyboard, decimals, bounds, ISO typing and date/month calendar; mobile viewport.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
