import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import puppeteer from 'puppeteer-core';
const root=process.cwd();
const mocks={
 '@/contexts/AuthContext': 'export const useAuth=()=>({can:()=>true});',
 '@/lib/api': 'export const api={get:async path=>{window.requests.push(path);return {entries:[],nextCursor:null};}};',
 'next/link': 'import React from "react";export default function Link(props){return <a {...props}/>;}',
};
const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {DateFilterBar,matchesDate} from '@/components/ui/list-filters';
import {ActivityFeed} from '@/components/activity-feed';
window.requests=[];
function App(){const [filter,setFilter]=useState({mode:'all',from:'',to:''});const dates=['2026-10-03','2026-10-04','2026-10-10','2026-10-11','2026-10-17','2026-10-18'];
return <main><DateFilterBar value={filter} onChange={setFilter}/><p id="results">{dates.filter(date=>matchesDate(date,filter)).join(',')}</p><ActivityFeed full/></main>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'mocks',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));}}]});
const css=await postcss([tailwind()]).process(await fs.readFile('app/globals.css','utf8'),{from:root+'/app/globals.css'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ar-SA" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.css+'main{padding:16px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}#results{overflow-wrap:anywhere}</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const width of [1280,390]){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-08T12:00:00+03:00']));}static now(){return new RealDate('2026-10-08T12:00:00+03:00').getTime();}};});
 await page.setViewport({width,height:900});const session=await page.createCDPSession();await session.send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#results');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='هذا الأسبوع').click());
 assert.equal(await page.$eval('#results',e=>e.textContent),'2026-10-04,2026-10-10');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='الأسبوع القادم').click());
 assert.equal(await page.$eval('#results',e=>e.textContent),'2026-10-11,2026-10-17');
 assert.match(await page.$eval('main',e=>e.textContent),/2026-10-11.*2026-10-17/);
 await page.select('[aria-label="فترة النشاطات"]','next-week');
 const dates=await page.$$eval('form input[data-latin-field="date"]',nodes=>nodes.map(n=>n.value));assert.deepEqual(dates,['2026-10-11','2026-10-17']);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('تصفية')).click());
 await page.waitForFunction(()=>window.requests.some(path=>path.includes('from=')));
 const request=await page.evaluate(()=>window.requests.at(-1));const params=new URL(request,'http://local').searchParams;
 assert.equal(params.get('from'),'2026-10-11T00:00:00+03:00');assert.equal(params.get('to'),'2026-10-17T23:59:59.999+03:00');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.equal(await page.$eval('main',node=>[...node.children].every(child=>{const rect=child.getBoundingClientRect();return rect.left>=0&&rect.right<=window.innerWidth;})),true);
 await fs.mkdir('tmp/week-filters',{recursive:true});await page.screenshot({path:'tmp/week-filters/'+width+'.png',fullPage:true});
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: Sunday/Saturday and next-week UI/results on mobile/desktop, Riyadh week from foreign browser timezone, activity request boundaries.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
