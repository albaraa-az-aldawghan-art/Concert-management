import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildKitchenSummaryPdfHtml } from "../lib/kitchen-pdf";
import { paginateKitchenPdfDocument } from "../lib/kitchen-pdf-pagination";
import { launchPdfBrowser } from "../lib/server/pdf-browser";
import type { KitchenExportOrder } from "../lib/kitchen-export";

async function main(){
  const font=await readFile("node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2","base64");
  const browser=await launchPdfBrowser();
  try{
    const page=await browser.newPage();
    for(const length of [30,180]){
      const order:KitchenExportOrder={id:"flow",concertId:"flow",concertNumber:900001,clientName:"اختبار",concertName:"حفلة اختبار توزيع الصفوف",status:"sent",concertDate:"2026-11-04",lines:Array.from({length},(_,index)=>({name:`صنف ${String(index+1).padStart(3,"0")}`,categoryName:index<length-8?"الأطباق الرئيسية":"المقبلات الباردة",quantity:index+1,notes:index%21===0?"ملاحظة طويلة نسبيًا لاختبار الارتفاع الحقيقي والتفاف النص داخل العمود":""}))};
      await page.setContent(buildKitchenSummaryPdfHtml([order],{date:{mode:"all",from:"",to:""},search:""},font));
      await page.evaluate(()=>document.fonts.ready);
      const metrics=await page.evaluate(paginateKitchenPdfDocument);
      assert.equal(metrics.rows,length);
      for(const item of metrics.breaks)assert.ok(item.remaining<item.required+10,JSON.stringify(item));
      const layout=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>(".pdf-column")).map(column=>({
        rows:Array.from(column.querySelectorAll<HTMLTableRowElement>("tbody tr")).map(row=>({name:row.cells[0].textContent,quantity:row.cells[1].textContent,bottom:row.getBoundingClientRect().bottom})),
        bottom:column.getBoundingClientRect().bottom,
        tables:Array.from(column.querySelectorAll("table")).map(table=>({category:table.getAttribute("aria-label"),heading:table.querySelector(".category-heading")!.textContent,count:table.querySelectorAll("tbody tr").length})),
      })));
      const flattened=layout.flatMap(column=>column.rows);
      assert.deepEqual(flattened.map(row=>row.name),order.lines!.map(line=>line.name));
      assert.deepEqual(flattened.map(row=>Number(row.quantity!.replaceAll(",",""))),order.lines!.map(line=>line.quantity));
      for(const column of layout){
        assert.equal(new Set(column.tables.map(table=>table.category)).size,column.tables.length,"A section must not be chunked inside the same column");
        assert.ok(column.rows.every(row=>row.bottom<=column.bottom),"No clipped rows");
        assert.ok(column.tables.every(table=>table.count>0),"No orphan section headings");
      }
      const seen=new Set<string>();
      for(const column of layout)for(const table of column.tables){assert.equal(table.heading!.includes("(تابع)"),seen.has(table.category!));seen.add(table.category!);}
      if(length===30){assert.equal(metrics.pages,1);assert.equal(layout[0].rows.length,30);assert.equal(layout[1].rows.length,0);}
      else{assert.ok(metrics.pages>=2);assert.ok(layout[0].rows.length>12);assert.ok(layout[1].rows.length>12);}
      await mkdir("tmp/pdfs/kitchen",{recursive:true});
      await writeFile(`tmp/pdfs/kitchen/flow-${length}.pdf`,await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true,margin:{top:"8mm",bottom:"12mm",left:"7mm",right:"7mm"}}));
      console.log(`PASS: ${length} rows, ${metrics.pages} page(s); fill right then left, exact order and quantities, measured boundaries and correct continuation headings.`);
    }
    const manyNames:KitchenExportOrder[]=Array.from({length:250},(_,index)=>({id:`name-${index}`,concertId:`name-${index}`,concertNumber:index,clientName:"اختبار",concertName:`حفلة اختبار الأسماء الطويلة لضمان عدم فقد أي اسم عند تجاوز مساحة الترويسة - الفرع ${index}`,status:"sent",concertDate:"2026-11-04",lines:[{name:"صنف واحد",categoryName:"قسم الاختبار",quantity:1}]}));
    await page.setContent(buildKitchenSummaryPdfHtml(manyNames,{date:{mode:"all",from:"",to:""},search:""},font));await page.evaluate(()=>document.fonts.ready);
    const named=await page.evaluate(paginateKitchenPdfDocument);
    const names=await page.$$eval('.heading .concerts > span:not(.separator)',nodes=>nodes.map(node=>node.textContent));
    assert.deepEqual(names,manyNames.map(order=>order.concertName));assert.equal(named.rows,1);assert.ok(named.pages>1);
    assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('.pdf-page')).every(page=>Array.from(page.querySelectorAll<HTMLElement>('.heading, tbody tr')).every(node=>node.getBoundingClientRect().bottom<=page.getBoundingClientRect().bottom))));
    console.log('PASS: 250 long event names preserved exactly once above items across header pages, without clipping.');
  }finally{await browser.close();}
}
void main();
