import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildKitchenSummaryWorkbook } from "./kitchen-export";
import { aggregateKitchenOrders, matchesKitchenExportOrder, type KitchenExportOrder } from "../kitchen-export";

const order=(id:string,date="2026-10-13"):KitchenExportOrder=>({id,concertId:id,concertNumber:Number(id)||1,clientName:"عميل الاختبار",concertDate:date,venueName:"قاعة",status:"received",lines:[{name:"كشري",categoryName:"الأطباق",quantity:3},{name:"ام علي",quantity:2}]});
test("kitchen export aggregates all selected events without page limits and keeps numeric quantities",async()=>{
  const orders=Array.from({length:25},(_,i)=>order(String(i+1)));
  const wb=buildKitchenSummaryWorkbook(orders);
  const bytes=await wb.xlsx.writeBuffer();
  const read=new ExcelJS.Workbook();await read.xlsx.load(bytes);
  assert.equal(read.worksheets.length,1);
  const ws=read.worksheets[0];
  assert.equal(ws.rowCount,6);
  assert.deepEqual([1,2,3,4,5].map(i=>ws.getRow(4).getCell(i).value),["رقم","اسم الصنف","العدد","ملاحظات 1","ملاحظات 2"]);
  const rows=[5,6].map(i=>({name:ws.getCell(`B${i}`).value,quantity:ws.getCell(`C${i}`).value}));
  assert.deepEqual(rows.find(r=>r.name==="كشري"),{name:"كشري",quantity:75});
  assert.deepEqual(rows.find(r=>r.name==="ام علي"),{name:"ام علي",quantity:50});
  for(const r of [5,6]){assert.equal(typeof ws.getCell(`C${r}`).value,"number");assert.equal(ws.getCell(`D${r}`).value,null);assert.equal(ws.getCell(`E${r}`).value,null);}
  assert.equal(ws.views[0].rightToLeft,true);assert.equal(ws.views[0].state,"frozen");
});
test("received-only, duplicates, missing quantities and missing order lines are rejected",()=>{
  assert.throws(()=>aggregateKitchenOrders([{...order("1"),status:"sent"}]),/لم يُؤكَّد/);
  assert.throws(()=>aggregateKitchenOrders([order("1"),order("1")]),/تكررت/);
  for(const quantity of [null,NaN,-1,Infinity])assert.throws(()=>aggregateKitchenOrders([{...order("1"),lines:[{name:"كشري",quantity}]}]),/راجع/);
  assert.throws(()=>aggregateKitchenOrders([{...order("1"),lines:undefined}]),/لا توجد أصناف/);
  assert.throws(()=>buildKitchenSummaryWorkbook([]),/لا توجد أصناف/);
});
test("item aggregation preserves categories, real zero and decimal quantities",()=>{
  const rows=aggregateKitchenOrders([{...order("1"),lines:[{name:"  كشري ",categoryName:"الأطباق",quantity:0.1},{name:"كشري",categoryName:"الأطباق",quantity:0.2},{name:"كشري",categoryName:"أخرى",quantity:2},{name:"صفر",quantity:0}]}]);
  assert.equal(rows.find(r=>r.name==="كشري (الأطباق)")?.quantity,0.3);
  assert.equal(rows.find(r=>r.name==="كشري (أخرى)")?.quantity,2);
  assert.equal(rows.find(r=>r.name==="صفر")?.quantity,0);
});
test("export uses concert date, inclusive Riyadh week/month/custom bounds and normalized search",()=>{
  const now=new Date("2026-10-13T12:00:00Z");
  const filters={date:{mode:"week" as const,from:"",to:""},search:""};
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-11"),filters,now),true);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-17"),filters,now),true);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-18"),filters,now),false);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-10T21:00:00Z"),filters,now),true);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-18"),{...filters,date:{mode:"next-week",from:"",to:""}},now),true);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-31"),{...filters,date:{mode:"month",from:"",to:""}},now),true);
  assert.equal(matchesKitchenExportOrder(order("1","2026-10-13"),{date:{mode:"custom",from:"2026-10-13",to:"2026-10-13"},search:"#١"},now),true);
});
