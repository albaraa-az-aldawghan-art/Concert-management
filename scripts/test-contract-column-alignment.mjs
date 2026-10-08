import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import puppeteer from 'puppeteer-core';

const source = await fs.readFile('app/(dashboard)/admin/contracts/[id]/page.tsx', 'utf8');
const rowCode = source.slice(source.indexOf('interface LineDraft'), source.indexOf('export default function ContractDetailPage'));
const header = source.match(/<thead>[\s\S]*?<\/thead>/)[0];
assert.match(source, /data-table contract-day-table/);
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {DndContext} from '@dnd-kit/core';import {useSortable,SortableContext} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';import {GripVertical,Trash2} from 'lucide-react';
import {LatinInput} from '@/components/ui/latin-input';
const money=n=>n.toLocaleString('en-US');const int=money;
const contract={contractType:'paid'};const contractPriceLabel=()=> 'سعر البيع';
${rowCode}
const row={barcode:'test',name:'ساندويش دجاج باللبنة',price:11,opening:134,supplied:'135',damaged:'3',remaining:'124',sold:142,revenue:1562,invalid:false};
createRoot(document.getElementById('root')).render(<main><div className="overflow-x-auto"><DndContext><SortableContext items={['test']}><table className="data-table contract-day-table w-full min-w-[46rem]">${header}<tbody><DayLineRow row={row} editable={true} onChangeField={()=>{}} onDelete={()=>{}}/></tbody></table></SortableContext></DndContext></div></main>);
` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
const css = await postcss([tailwind()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: process.cwd() + '/app/globals.css' });
const server = http.createServer((req, res) => {res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css} main{padding:16px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage();
  for(const width of [1280,390]) {
    await page.setViewport({width,height:850});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('tbody input');
    const results=await page.evaluate(()=> {
      const heads=[...document.querySelectorAll('thead th')];const cells=[...document.querySelectorAll('tbody td')];
      const center=e=> {const r=e.getBoundingClientRect();return r.left+r.width/2;};
      return {overflow:document.documentElement.scrollWidth>innerWidth,columns:heads.slice(1,9).map((h,j)=> {
        const c=cells[j+1];return {header:getComputedStyle(h).textAlign,cell:getComputedStyle(c).textAlign,delta:Math.abs(center(h)-center(c)),inputDelta:c.querySelector('input')?Math.abs(center(h)-center(c.querySelector('input'))):0};
      })};
    });
    assert.equal(results.overflow,false);
    for(const column of results.columns) {assert.equal(column.header,'center');assert.equal(column.cell,'center');assert.ok(column.delta<1);assert.ok(column.inputDelta<1);}
    await fs.mkdir('tmp/contract-alignment',{recursive:true});await page.screenshot({path:`tmp/contract-alignment/${width}.png`});
  }
  console.log('PASS: actual daily row and headers share centered axes; all 8 columns and inputs, desktop and mobile.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
