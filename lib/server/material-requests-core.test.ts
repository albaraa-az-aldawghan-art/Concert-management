/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory Firestore doubles implement several SDK overloads. */
import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { createMaterialRequest, editMaterialRequest, receiveMaterialRequest, postMaterialInvoice, voidMaterialReceipt, cancelMaterialRequest, setMaterialPolicy, requireMaterialOwner, getMaterialRequest, materialDate, materialNumber, classifyMaterial, assignMaterialRequest, materialRequestPrintData } from "./material-requests-core";
import { svcAddStoreDamage, svcDeleteIncoming } from "./costs-core";
import { automaticMaterialQuantity, materialState, type MaterialRequestLine } from "../material-requests";

type Data = Record<string, any>;
test("department classification is explicit and many-to-many, request validation is server-side, and assignments grant scoped access only", async () => {
  const f = fixture();
  f.records.set("users/worker", { name: "أحمد" });
  const input = { ...f.requestInput(), section: "restaurant" as const, assignedTo: "worker" };
  await assert.rejects(createMaterialRequest(f.db, "owner", input), /صلاحية/);
  await assert.rejects(createMaterialRequest(f.db, "owner", input, true), /لا تتبع/);
  await classifyMaterial(f.db, "owner", "RICE", ["restaurant", "concerts"]);
  assert.equal(f.item().totalIn, 20); assert.equal(f.item().totalInValue, 200);
  await createMaterialRequest(f.db, "owner", input, true);
  const request = f.records.get("cost_material_requests/request_1")!;
  assert.equal(request.assignedToName, "أحمد");
  assert.deepEqual(request.lines[0].sections, ["restaurant", "concerts"]);
  assert.doesNotThrow(() => requireMaterialOwner({ createdBy: request.createdBy, assignedTo: request.assignedTo }, "worker", false));
  assert.throws(() => requireMaterialOwner({ createdBy: request.createdBy, assignedTo: request.assignedTo }, "stranger", false));
  assert.equal((await getMaterialRequest(f.db, "worker", false, false, "request_1")).request.assignedTo, "worker");
  assert.equal((await materialRequestPrintData(f.db, "worker", false, "request_1", "restaurant")).lines.length, 1);
  await assert.rejects(materialRequestPrintData(f.db, "stranger", false, "request_1", "general"), /صلاحية/);
  await assert.rejects(materialRequestPrintData(f.db, "worker", false, "request_1", "contracts"), /قسم/);
  await assert.rejects(assignMaterialRequest(f.db, "owner", false, "request_1", "missing", request.updatedAt), /الموظف/);
  await assert.rejects(assignMaterialRequest(f.db, "owner", false, "request_1", null, "stale"), /تغيّر/);
  f.records.set("users/second", { name: "محمد" });
  await assignMaterialRequest(f.db, "owner", false, "request_1", "second", request.updatedAt);
  await assert.rejects(getMaterialRequest(f.db, "worker", false, false, "request_1"), /صلاحية/);
  assert.equal((await getMaterialRequest(f.db, "second", false, false, "request_1")).request.assignedToName, "محمد");
});
test("PDF general contains all materials; specific department filters mixed requests and supports legacy classifications without inventing ownership", async () => {
  const f = fixture();
  await createMaterialRequest(f.db, "owner", f.requestInput());
  await assert.rejects(materialRequestPrintData(f.db, "owner", false, "request_1", "restaurant"), /لا توجد مواد/);
  assert.equal((await materialRequestPrintData(f.db, "owner", false, "request_1", "general")).lines.length, 1);
  await classifyMaterial(f.db, "owner", "RICE", ["restaurant"]);
  // Classification can be added later, including requests created before departments existed.
  assert.equal((await materialRequestPrintData(f.db, "owner", false, "request_1", "restaurant")).lines.length, 1);
  delete f.records.get("cost_material_requests/request_1")!.lines[0].sections;
  assert.equal((await materialRequestPrintData(f.db, "owner", false, "request_1", "restaurant")).lines.length, 1);
  await assert.rejects(classifyMaterial(f.db, "owner", "RICE", ["unknown"]), /أقسام/);
  await assert.rejects(classifyMaterial(f.db, "owner", "SALE", ["restaurant"]), /المواد الخام/);
  assert.equal(f.item().totalIn, 20); assert.equal(f.item().materialOpenQuantity, 10);
});
function fixture() {
  const records = new Map<string, Data>([["cost_items/RICE", { name:"أرز",kind:"raw",unit:"كجم",purchaseUnit:"كيس",purchaseToIssue:10,totalIn:20,totalOut:0,totalInValue:200,minimumStock:5 }], ["cost_items/SALE",{name:"منتج",kind:"sale",unit:"حبة",totalIn:0,totalOut:0}]]);
  let sequence = 0, reads = 0, wrote = false;
  const snapshot = (path: string) => ({ id:path.split("/").at(-1)!,ref:reference(path),exists:records.has(path),data:()=>records.has(path)?{...records.get(path)!}:undefined });
  const reference = (path: string): any => ({ path,id:path.split("/").at(-1)!,get:async()=>snapshot(path) });
  const query = (name: string, conditions: [string,string,unknown][] = []): any => ({
    path:name,
    doc:(id?:string)=>reference(`${name}/${id??`auto_${++sequence}`}`),
    where:(field:string,op:string,value:unknown)=>query(name,[...conditions,[field,op,value]]),
    orderBy:()=>query(name,conditions),limit:()=>query(name,conditions),
    get:async()=>{
      const docs=[...records.keys()].filter(p=>p.startsWith(name+"/")&&p.split("/").length===2).filter(p=>conditions.every(([f,op,v])=>op==="in"?(v as unknown[]).includes(records.get(p)![f]):records.get(p)![f]===v)).map(snapshot);
      return {docs,size:docs.length,empty:!docs.length};
    },
  });
  let pending = Promise.resolve();
  const db = { collection:(name:string)=>query(name),getAll:async(...refs:any[])=>refs.map(r=>snapshot(r.path)),
    runTransaction: async (work:(tx:any)=>Promise<unknown>)=>{
      const previous=pending; let unlock!:()=>void; pending=new Promise<void>(r=>{unlock=r}); await previous;
      try {
        const operations:(()=>void)[]=[];wrote=false;
        const tx = {
          get:async(r:any)=>{assert.equal(wrote,false,"all reads precede writes");reads++;return r.path?.split("/").length===2?snapshot(r.path):r.get()},
          set:(r:any,data:Data,options?:Data)=>{wrote=true;operations.push(()=>records.set(r.path,options?.merge?{...records.get(r.path),...data}:{...data}))},
          create:(r:any,data:Data)=>{wrote=true;operations.push(()=>{assert.equal(records.has(r.path),false,"create only once");records.set(r.path,{...data})})},
          update:(r:any,data:Data)=>{wrote=true;operations.push(()=>{assert.ok(records.has(r.path));records.set(r.path,{...records.get(r.path),...data})})},
          delete:(r:any)=>{wrote=true;operations.push(()=>records.delete(r.path))},
        };
        const result=await work(tx);operations.forEach(op=>op());return result;
      } finally {unlock();}
    },
  } as unknown as Firestore;
  const requestInput = (id="request_1",quantity=10) => ({operationId:id,requestDate:"2026-11-14",notes:"اختبار",lines:[{barcode:"RICE",quantity,enteredUnit:"stock" as const}]});
  const receiptInput = (id="receipt_1",quantity=4) => ({operationId:id,receivedDate:"2026-11-14",supplierName:"المورد",lines:[{barcode:"RICE",quantity,enteredUnit:"stock" as const}]});
  return {db,records,requestInput,receiptInput,item:()=>records.get("cost_items/RICE")!,readCount:()=>reads};
}

test("material requests reserve no stock/value; manual duplicate orders accumulate coverage; retries do not duplicate",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  assert.equal(f.item().totalIn,20);assert.equal(f.item().totalInValue,200);assert.equal(f.item().materialOpenQuantity,10);
  await createMaterialRequest(f.db,"owner",f.requestInput());assert.equal(f.item().materialOpenQuantity,10);
  await createMaterialRequest(f.db,"owner",f.requestInput("request_2",5));assert.equal(f.item().materialOpenQuantity,15);
  const before=JSON.stringify([...f.records]);await assert.rejects(createMaterialRequest(f.db,"other",f.requestInput()));assert.equal(JSON.stringify([...f.records]),before);
});
test("partial arrival without invoice is held outside stock, later invoice posts exact converted cost once",async()=>{
  const f=fixture();const input=f.requestInput();input.lines[0].enteredUnit="purchase" as "stock";input.lines[0].quantity=2;
  await createMaterialRequest(f.db,"owner",input);
  assert.equal(f.item().materialOpenQuantity,20);
  const receipt={...f.receiptInput(),lines:[{barcode:"RICE",quantity:1,enteredUnit:"purchase" as const}]};
  const saved=await receiveMaterialRequest(f.db,"owner",false,false,"request_1",receipt);
  assert.equal(f.item().totalIn,20);assert.equal(f.item().totalInValue,200);assert.equal(f.item().materialOpenQuantity,10);assert.equal(f.item().materialPendingQuantity,10);
  await receiveMaterialRequest(f.db,"owner",false,false,"request_1",receipt);assert.equal(f.item().materialPendingQuantity,10);
  const invoice={invoiceNumber:"INV-1",invoiceDate:"2026-11-15",prices:[{barcode:"RICE",priceBeforeVat:120}]};
  await postMaterialInvoice(f.db,"owner",false,"request_1",saved.id,invoice);
  await postMaterialInvoice(f.db,"owner",false,"request_1",saved.id,invoice);
  assert.equal(f.item().totalIn,30);assert.equal(f.item().totalInValue,320);assert.equal(f.item().materialPendingQuantity,0);
  const entries=[...f.records].filter(([p])=>p.startsWith("cost_incoming/"));assert.equal(entries.length,1);assert.equal(entries[0][1].purchaseQuantity,1);assert.equal(entries[0][1].quantity,10);
  await assert.rejects(svcDeleteIncoming(f.db,entries[0][0].split("/")[1]),/مرتبط بطلب مواد/);
});
test("invoice at arrival completes in one transaction and zero must be explicit, not missing",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  const receipt={...f.receiptInput("done",10),invoice:{invoiceNumber:"I",invoiceDate:"2026-11-14",prices:[{barcode:"RICE",priceBeforeVat:0}]}};
  await receiveMaterialRequest(f.db,"owner",false,false,"request_1",receipt);
  assert.equal(f.item().totalIn,30);assert.equal(f.item().totalInValue,200);assert.equal(f.records.get("cost_material_requests/request_1")!.state,"completed");
});
test("overreceipt requires permission and tracks actual quantity without a negative outstanding",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  const before=JSON.stringify([...f.records]);await assert.rejects(receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput("large",12)),/صلاحية/);assert.equal(JSON.stringify([...f.records]),before);
  await receiveMaterialRequest(f.db,"owner",false,true,"request_1",f.receiptInput("large",12));
  assert.equal(f.item().materialOpenQuantity,0);assert.equal(f.item().materialPendingQuantity,12);assert.equal(f.records.get("cost_material_requests/request_1")!.state,"awaiting_invoice");
});
test("concurrent receipts cannot consume the same outstanding quantity twice",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  const results=await Promise.allSettled([receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput("a",8)),receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput("b",8))]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(f.item().materialPendingQuantity,8);assert.equal(f.item().materialOpenQuantity,2);
});
test("cancel remaining preserves pending arrival and invoice; reversing pending arrival reopens exact quantity",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  const first=await receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput());
  await voidMaterialReceipt(f.db,"owner",false,"request_1",first.id,"خطأ بالكمية");
  assert.equal(f.item().materialOpenQuantity,10);assert.equal(f.item().materialPendingQuantity,0);
  const second=await receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput("second",4));
  await cancelMaterialRequest(f.db,"owner",false,"request_1","المورد لن يكمل");assert.equal(f.item().materialOpenQuantity,0);assert.equal(f.item().materialPendingQuantity,4);
  await postMaterialInvoice(f.db,"owner",false,"request_1",second.id,{invoiceNumber:"I",invoiceDate:"2026-11-14",prices:[{barcode:"RICE",priceBeforeVat:100}]});
  assert.equal(f.item().totalIn,24);assert.equal(f.item().totalInValue,240);assert.equal(f.records.get("cost_material_requests/request_1")!.state,"cancelled");
});
test("editing requires revision and no arrivals; rebalances outstanding quantities",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());const req=f.records.get("cost_material_requests/request_1")!;
  await assert.rejects(editMaterialRequest(f.db,"owner",false,"request_1",f.requestInput("edit",15),"stale"),/تعديل/);
  await editMaterialRequest(f.db,"owner",false,"request_1",f.requestInput("edit",15),req.updatedAt);assert.equal(f.item().materialOpenQuantity,15);
  await receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput());
  await assert.rejects(editMaterialRequest(f.db,"owner",false,"request_1",f.requestInput("edit2",20),f.records.get("cost_material_requests/request_1")!.updatedAt));
});
test("reversing a posted receipt restores exact stock/value and blocks once stock was consumed",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  const receipt={...f.receiptInput("priced",4),invoice:{invoiceNumber:"INV",invoiceDate:"2026-11-14",prices:[{barcode:"RICE",priceBeforeVat:100}]}};
  const saved=await receiveMaterialRequest(f.db,"owner",false,false,"request_1",receipt);
  assert.equal(f.item().totalIn,24);assert.equal(f.item().totalInValue,240);
  f.item().totalOut=1;const before=JSON.stringify([...f.records]);
  await assert.rejects(voidMaterialReceipt(f.db,"owner",false,"request_1",saved.id,"تصحيح"),/صرف/);assert.equal(JSON.stringify([...f.records]),before);
  f.item().totalOut=0;
  await voidMaterialReceipt(f.db,"owner",false,"request_1",saved.id,"تصحيح");
  assert.equal(f.item().totalIn,20);assert.equal(f.item().totalInValue,200);assert.equal(f.item().materialOpenQuantity,10);
  assert.equal([...f.records.keys()].filter(p=>p.startsWith("cost_incoming/")).length,0);
  assert.equal([...f.records.keys()].filter(p=>p.startsWith("cost_purchase_invoices/")).length,0);
  assert.equal(f.records.get("cost_material_receipts/"+saved.id)!.state,"void");
  assert.equal(f.records.get("cost_material_requests/request_1")!.lastReceivedAt,null);
});
test("automatic policy creates only uncovered shortage and real damage triggers it without opening the page",async()=>{
  const f=fixture();await setMaterialPolicy(f.db,"admin","RICE",{enabled:true,minimumStock:5,targetStock:30});
  assert.equal([...f.records.keys()].filter(p=>p.startsWith("cost_material_requests/")).length,0);
  await svcAddStoreDamage(f.db,{itemBarcode:"RICE",quantity:15,reason:"تالف",damageDate:"2026-11-14",createdBy:"admin"});
  assert.equal(f.item().totalOut,15);assert.equal(f.item().materialOpenQuantity,25);
  const req=[...f.records].find(([p])=>p.startsWith("cost_material_requests/"))![1];assert.equal(req.source,"automatic");assert.equal(req.lines[0].requested,25);assert.match(req.requestDate,/^\d{4}-\d{2}-\d{2}$/);
  await setMaterialPolicy(f.db,"admin","RICE",{enabled:true,minimumStock:5,targetStock:30});assert.equal(f.item().materialOpenQuantity,25);
  await setMaterialPolicy(f.db,"admin","RICE",{enabled:false,minimumStock:5,targetStock:30});await svcAddStoreDamage(f.db,{itemBarcode:"RICE",quantity:1,reason:"تالف",damageDate:"2026-11-14",createdBy:"admin"});assert.equal(f.item().materialOpenQuantity,25);
});
test("automatic shortage accounts for pending invoice arrivals and existing open orders",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput("request_1",15));await receiveMaterialRequest(f.db,"owner",false,false,"request_1",f.receiptInput("pending",10));
  await setMaterialPolicy(f.db,"admin","RICE",{enabled:true,minimumStock:25,targetStock:40});
  assert.equal(f.item().materialOpenQuantity,10); // 5 old open + 5 uncovered (40 - 20 - 5 - 10).
  assert.equal(f.item().materialPendingQuantity,10);
  await assert.rejects(setMaterialPolicy(f.db,"admin","RICE",{enabled:true,minimumStock:40,targetStock:40}));
});
test("owner scope, price redaction and malformed/nonraw input reject without writes",async()=>{
  const f=fixture();await createMaterialRequest(f.db,"owner",f.requestInput());
  assert.throws(()=>requireMaterialOwner({createdBy:"owner"},"other",false));
  await receiveMaterialRequest(f.db,"owner",false,false,"request_1",{...f.receiptInput("done",10),invoice:{invoiceNumber:"I",invoiceDate:"2026-11-14",prices:[{barcode:"RICE",priceBeforeVat:123}]}});
  const hidden=await getMaterialRequest(f.db,"owner",false,false,"request_1");assert.equal("priceBeforeVat" in hidden.receipts[0].lines[0],false);
  const visible=await getMaterialRequest(f.db,"other",true,true,"request_1");assert.equal(visible.receipts[0].lines[0].priceBeforeVat,123);
  await assert.rejects(getMaterialRequest(f.db,"other",false,true,"request_1"));
  const bad=f.requestInput("bad");bad.lines[0].barcode="SALE";await assert.rejects(createMaterialRequest(f.db,"owner",bad));assert.equal(f.records.has("cost_material_requests/bad"),false);
  assert.throws(()=>materialDate("2026-02-30","تاريخ"));assert.throws(()=>materialNumber(NaN,"كمية"));assert.throws(()=>materialNumber(0,"كمية"));assert.throws(()=>materialNumber(0.001,"كمية"));
});
test("pure state and automatic coverage never turn missing costs into stock or generate requests for sale items",()=>{
  assert.equal(automaticMaterialQuantity({kind:"sale",materialAutoEnabled:true,minimumStock:5,materialTargetStock:20}),0);
  assert.equal(automaticMaterialQuantity({materialAutoEnabled:true,totalIn:0,minimumStock:0,materialTargetStock:20,materialOpenQuantity:10,materialPendingQuantity:10}),0);
  assert.equal(materialState([{requested:10,received:10,posted:0,cancelled:0} as MaterialRequestLine]),"awaiting_invoice");
});
