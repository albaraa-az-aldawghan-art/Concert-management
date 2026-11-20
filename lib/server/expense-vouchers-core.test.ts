import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { approveVoucher,cleanVoucher,saveVoucher,settleVoucher,voidVoucher,voucherCosts,voucherList } from "./expense-vouchers-core";
import { splitVoucher,voucherTotals,voucherRatio,voucherAmountWords,type ExpenseVoucher } from "../expense-vouchers";
import { readExpenseExport } from "./expenses-export";
import { expenseExportTotals } from "../expenses-export";
import { buildExpensesWorkbook } from "./expenses-workbook";
import { svcCancelConcert,svcDeleteExpense,svcDeleteConcert } from "./concerts-core";
import { svcContractMonth } from "./contract-ledger-core";

export function voucherFixture(){
  const records=new Map<string,Record<string,unknown>>();let number=0;
  const snap=(path:string)=>({id:path.split("/").at(-1)!,ref:ref(path),exists:records.has(path),data:()=>records.get(path)});
  const ref=(path:string)=>({path,id:path.split("/").at(-1)!,get:async()=>snap(path),set:async(data:Record<string,unknown>)=>{records.set(path,data)},update:async(data:Record<string,unknown>)=>{records.set(path,{...records.get(path),...data})},delete:async()=>{records.delete(path)}});
  function query(name:string,filters:[string,string,unknown][]=[],orders:[string,string][]=[],limit=Infinity,after:unknown[]=[]):unknown {
    return {path:name,doc:(id=`auto_${++number}`)=>ref(`${name}/${id}`),where:(field:string,op:string,value:unknown)=>query(name,[...filters,[field,op,value]],orders,limit,after),orderBy:(field:unknown,dir="asc")=>query(name,filters,[...orders,[typeof field==="string"?field:"__name__",dir]],limit,after),limit:(n:number)=>query(name,filters,orders,n,after),startAfter:(...v:unknown[])=>query(name,filters,orders,limit,v),get:async()=>{
      let list=[...records].filter(([p])=>p.startsWith(name+"/")&&p.split("/").length===2).map(([p])=>snap(p));
      const val=(d:ReturnType<typeof snap>,field:string)=>field==="__name__"?d.id:d.data()?.[field];
      list=list.filter(d=>filters.every(([f,op,v])=>op==="=="?val(d,f)===v:op==="array-contains"?(val(d,f) as unknown[]|undefined)?.includes(v):op===">="?String(val(d,f))>=String(v):op==="<="?String(val(d,f))<=String(v):false));
      list.sort((a,b)=>{for(const [f,dir]of orders){const x=val(a,f),y=val(b,f);if(x!==y)return(String(x)<String(y)?-1:1)*(dir==="desc"?-1:1)}return 0});
      if(after.length)list=list.filter(d=>{for(let i=0;i<orders.length;i++){const x=val(d,orders[i][0]),y=after[i];if(x!==y)return orders[i][1]==="desc"?String(x)<String(y):String(x)>String(y)}return false});
      const docs=list.slice(0,limit);return{docs,size:docs.length,empty:!docs.length};
    }};
  }
  let queue=Promise.resolve();
  const db={collection:query,getAll:async(...refs:ReturnType<typeof ref>[])=>refs.map(r=>snap(r.path)),runTransaction:<T>(fn:(tx:unknown)=>Promise<T>)=>{
    const run=queue.then(async()=>{const writes:(()=>void)[]=[];let writing=false;
      const tx={get:async(r:ReturnType<typeof ref>)=>{assert.equal(writing,false,"all reads before financial writes");return r.path.split("/").length===2?snap(r.path):r.get()},set:(r:ReturnType<typeof ref>,d:Record<string,unknown>)=>{writing=true;writes.push(()=>{records.set(r.path,d)})},update:(r:ReturnType<typeof ref>,d:Record<string,unknown>)=>{writing=true;writes.push(()=>{assert.ok(records.has(r.path));records.set(r.path,{...records.get(r.path),...d})})},delete:(r:ReturnType<typeof ref>)=>{writing=true;writes.push(()=>{records.delete(r.path)})}};
      const result=await fn(tx);writes.forEach(w=>w());return result;});queue=run.then(()=>undefined,()=>undefined);return run;
  }} as unknown as Firestore;
  records.set("expense_settings/config",{types:[{name:"عمال",kind:"labor"}]});
  for(const id of["a","b","c"])records.set("concerts/"+id,{name:"حفلة "+id,clientName:"عميل "+id,status:"confirmed",concertNumber:id.charCodeAt(0),vatRate:5});
  records.set("contracts/contract",{name:"عقد المدارس",status:"active",terms:[]});
  return{db,records};
}
const input={date:"2026-11-21",department:"concerts",recipient:"المستلم",type:"عمال",kind:"labor",method:"cash",description:"4 عمال على 3 حفلات",source:"direct",amount:500,vatMode:"none",vatRate:15,targetIds:["a","b","c"]};
test("integer halalas reconcile across 1..40 beneficiaries and all VAT modes",()=>{
  for(const mode of["none","inclusive","exclusive"] as const)for(let n=1;n<=40;n++)for(const amount of[1,29,100,50000,999999]){
    const t=voucherTotals(amount,mode,15),a=splitVoucher(t.gross,t.tax,Array.from({length:n},(_,i)=>({id:String(i),name:"name",number:""})));
    assert.equal(a.reduce((s,a)=>s+a.gross,0),t.gross);assert.equal(a.reduce((s,a)=>s+a.net,0),t.net);assert.equal(a.reduce((s,a)=>s+a.tax,0),t.tax);assert.ok(a.every(a=>a.net>=0&&a.net+a.tax===a.gross));assert.ok(Math.max(...a.map(a=>a.gross))-Math.min(...a.map(a=>a.gross))<=1);
  }
  assert.deepEqual(splitVoucher(50000,0,[{id:"a",name:"",number:""},{id:"b",name:"",number:""},{id:"c",name:"",number:""}]).map(a=>a.gross),[16667,16667,16666]);
  assert.match(voucherAmountWords(50000),/خمسمائة ريال/);assert.match(voucherAmountWords(12345),/مائة وثلاثة وعشرون.*خمسة وأربعون هللة/);
});
test("bad financial inputs rejected and dates/VAT snapshot validated",()=>{
  for(const change of[{amount:0},{amount:-10},{amount:1.001},{date:"2026-02-30"},{department:"invalid"},{method:"hack"},{vatMode:"auto"},{recipient:""},{targetIds:["a","a"]},{source:"inventory",invoiceId:"../x"}])assert.throws(()=>cleanVoucher({...input,...change}));
  assert.equal(cleanVoucher({...input,vatMode:"inclusive",amount:115}).net,10000);
  assert.equal(cleanVoucher({...input,recipient:"مستلم ١٢٣",description:"عدد ٤ عمال"}).recipient,"مستلم 123");
  assert.equal(cleanVoucher({...input,description:"عدد ٤ عمال"}).description,"عدد 4 عمال");
});
test("fractional VAT and large refund ratios round exact half-halala boundaries",()=>{
  assert.equal(voucherTotals(1500,"exclusive",17.9).tax,269);
  assert.equal(voucherTotals(1500,"exclusive",17.9).gross,1769);
  assert.equal(voucherTotals(3,"inclusive",20).net,3);
  assert.equal(voucherRatio(10_000_000_001,2_000_000_001,20_000_000_002),1_000_000_001);
  assert.equal(voucherRatio(1,1,2),1);assert.equal(voucherRatio(1,1,3),0);
});
test("drafts have no cost effect; approval is atomic, unique, idempotent and snapshot based",async()=>{
  const f=voucherFixture(),draft=await saveVoucher(f.db,"user","v",input,null);
  assert.equal(draft.state,"draft");assert.equal(f.records.has("counters/expense_vouchers_2026"),false);assert.equal([...f.records.keys()].filter(k=>k.startsWith("concert_expenses/")).length,0);
  const [a,b]=await Promise.all([approveVoucher(f.db,"user","v",draft.revision),approveVoucher(f.db,"user","v",draft.revision)]);
  assert.equal(a.number,"PV-2026-000001");assert.equal(b.number,a.number);assert.equal(f.records.get("counters/expense_vouchers_2026")?.value,1);
  assert.equal(f.records.get("concerts/a")?.laborCost,166.67);assert.equal(f.records.get("concerts/c")?.laborCost,166.66);
  await assert.rejects(saveVoucher(f.db,"user","v",input,a.revision),/تغير/);
  await assert.rejects(svcDeleteExpense(f.db,"voucher_v_a"),/سند صرف/);
  const vat=await saveVoucher(f.db,"user","vat",{...input,amount:115,vatMode:"inclusive",targetIds:["a"]},null);await approveVoucher(f.db,"user","vat",vat.revision);
  assert.equal(f.records.get("concerts/a")?.laborCost,266.67);assert.equal(f.records.get("concert_expenses/voucher_vat_a")?.snapshotNetAmount,100);
});
test("one expense workbook counts voucher once and keeps every beneficiary share",async()=>{
  const f=voucherFixture(),v=await saveVoucher(f.db,"u","v",input,null);await approveVoucher(f.db,"u","v",v.revision);
  const rows=await readExpenseExport(f.db,{from:"",to:""});assert.equal(rows.length,1);assert.equal(expenseExportTotals(rows).amount,50000);assert.equal(rows[0].allocations?.length,3);
  const book=await buildExpensesWorkbook(rows,{from:"",to:""});assert.equal(book.getWorksheet("توزيع السندات")?.getCell("G5").value,166.67);assert.equal(book.getWorksheet("توزيع السندات")?.getCell("G7").value,166.66);
  assert.equal(book.getWorksheet("ملخص المصاريف")?.getCell("C8").result,500);
});
test("inventory invoice payment must match, cannot duplicate, and adds no operating cost",async()=>{
  const f=voucherFixture();f.records.set("cost_purchase_invoices/inv",{totalBeforeVat:100,lineCount:1});f.records.set("cost_incoming/inv_line",{invoiceId:"inv",totalBeforeVat:100});
  const v=await saveVoucher(f.db,"u","inv1",{...input,department:"general",source:"inventory",invoiceId:"inv",amount:115,vatMode:"inclusive"},null);await approveVoucher(f.db,"u","inv1",v.revision);
  assert.equal((await voucherCosts(f.db)).length,0);assert.equal(f.records.get("cost_purchase_invoices/inv")?.expenseVoucherId,"inv1");
  const d=await saveVoucher(f.db,"u","inv2",{...input,department:"restaurant",source:"inventory",invoiceId:"inv",amount:115,vatMode:"inclusive"},null);
  await assert.rejects(approveVoucher(f.db,"u","inv2",d.revision),/سابق/);
  await voidVoucher(f.db,"u","inv1",2,"سند أدخل بالخطأ");assert.equal(f.records.get("cost_purchase_invoices/inv")?.expenseVoucherId,null);
  await approveVoucher(f.db,"u","inv2",d.revision);assert.equal(f.records.get("cost_purchase_invoices/inv")?.expenseVoucherId,"inv2");
});
test("consumed/redistributed/refunded cancellation settlements preserve the paid total and audit",async()=>{
  for(const mode of["consumed","redistributed","refunded"]){
    const f=voucherFixture(),d=await saveVoucher(f.db,"u","v",input,null),p=await approveVoucher(f.db,"u","v",d.revision);
    await assert.rejects(svcCancelConcert(f.db,"a",{reason:"إلغاء",refundAmount:null,refundDate:null,refundMethod:null}),/حدّد مصير/);
    await assert.rejects(svcDeleteConcert(f.db,"a"),/سند صرف/);
    const next=await settleVoucher(f.db,"u","v",{target:"a",revision:p.revision,mode,reason:"حسب الاستخدام الفعلي",amount:100,refundDate:"2026-11-21",refundMethod:"نقدي"});
    assert.equal(next.allocations.reduce((s,a)=>s+a.gross,0),next.gross-next.refunded);
    assert.equal(next.number,p.number);assert.equal(next.gross,50000);assert.equal(next.allocations[0].settlement,mode);
    if(mode==="redistributed"){assert.deepEqual(next.allocations.map(a=>a.gross),[0,25001,24999]);assert.equal(f.records.get("concerts/a")?.laborCost,null);}
    if(mode==="refunded"){assert.equal(next.refunded,10000);assert.equal(f.records.get("concerts/a")?.laborCost,66.67);}
    if(mode==="consumed")assert.equal(f.records.get("concerts/a")?.laborCost,166.67);
    await assert.rejects(settleVoucher(f.db,"u","v",{target:"a",revision:p.revision,mode,reason:"repeat"}),/تغير/);
    await svcCancelConcert(f.db,"a",{reason:"إلغاء بعد التسوية",refundAmount:null,refundDate:null,refundMethod:null});
    assert.equal(f.records.get("concerts/a")?.status,"cancelled");assert.equal(f.records.has("concert_expenses/voucher_v_a"),true);
    assert.equal(f.records.get("concerts/a")?.laborCost,mode==="consumed"?166.67:mode==="refunded"?66.67:null);
    if(mode==="consumed"){const later=await settleVoucher(f.db,"u","v",{target:"a",revision:next.revision,mode:"refunded",reason:"استرداد لاحق فعلي بعد الإلغاء",amount:50.01,refundDate:"2026-11-22",refundMethod:"نقدي"});assert.equal(later.refunded,5001);assert.equal(f.records.get("concerts/a")?.laborCost,116.66);}
  }
});
test("general overhead stays independent, contract month profit includes central cost once",async()=>{
  const f=voucherFixture();const g=await saveVoucher(f.db,"u","general",{...input,department:"general"},null);await approveVoucher(f.db,"u","general",g.revision);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith("concert_expenses")).length,0);
  const c=await saveVoucher(f.db,"u","contract",{...input,department:"contracts",targetIds:["contract"],amount:100},null);await approveVoucher(f.db,"u","contract",c.revision);
  const m=await svcContractMonth(f.db,"contract","2026-11");assert.equal(m.totals.voucherExpenses,100);assert.equal(m.totals.expenses,0);assert.equal(m.totals.profit,-100);
});
test("pagination includes all dates once and void reverses mirrors without deleting audit",async()=>{
  const f=voucherFixture();for(let i=0;i<25;i++)await saveVoucher(f.db,"u","draft"+String(i).padStart(2,"0"),{...input,department:"general"},null);
  const first=await voucherList(f.db,"","","");assert.equal(first.rows.length,20);const last=await voucherList(f.db,"","",first.nextCursor!);assert.equal(last.rows.length,5);assert.equal(new Set([...first.rows,...last.rows].map(r=>r.id)).size,25);
  const d=await saveVoucher(f.db,"u","paid",input,null),p=await approveVoucher(f.db,"u","paid",d.revision);await voidVoucher(f.db,"u","paid",p.revision,"قيد خاطئ");
  assert.equal(f.records.get("concerts/a")?.laborCost,null);assert.equal((f.records.get("expense_vouchers/paid") as unknown as ExpenseVoucher).events.length,2);
});
