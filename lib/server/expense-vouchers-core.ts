import { FieldPath, Timestamp } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { ApiError } from "./guard";
import { expenseHalalas, exportExpenseDate } from "./expenses-export";
import { splitVoucher, voucherTotals, voucherRatio, VOUCHER_DEPARTMENTS, VOUCHER_METHODS, type ExpenseVoucher, type VoucherAllocation } from "../expense-vouchers";
import { toLatinDigits } from "../utils";

export function voucherId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new ApiError("معرف السند أو الجهة غير صحيح"); return value;
}
const short = (v: unknown, label: string, max=120, required=true) => { if (typeof v !== "string" || v.trim().length > max || required && !v.trim()) throw new ApiError(`${label}: مطلوب أو أطول من المسموح`); return toLatinDigits(v.trim()); };
export function cleanVoucher(body: Record<string,unknown>) {
  if (typeof body.department !== "string" || !Object.hasOwn(VOUCHER_DEPARTMENTS,body.department)) throw new ApiError("اختر قسم المصروف");
  if (typeof body.method !== "string" || !Object.hasOwn(VOUCHER_METHODS,body.method)) throw new ApiError("اختر طريقة الدفع");
  if (!["none","inclusive","exclusive"].includes(String(body.vatMode))) throw new ApiError("اختر حالة الضريبة");
  if (!["transport","labor","other"].includes(String(body.kind))) throw new ApiError("تصنيف المصروف غير صحيح");
  if (body.source !== "direct" && body.source !== "inventory") throw new ApiError("حدد مصدر المصروف");
  const amount = expenseHalalas(body.amount,"المبلغ"), vatMode = body.vatMode as ExpenseVoucher["vatMode"];
  const vatRate = vatMode === "none" ? 0 : body.vatRate;
  if (typeof vatRate !== "number" || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || Math.abs(Math.round(vatRate*100)-vatRate*100)>0.0001) throw new ApiError("نسبة الضريبة غير صحيحة");
  let totals; try { totals = voucherTotals(amount,vatMode,vatRate); } catch { throw new ApiError("المبلغ أو الضريبة غير صحيح"); }
  let targetIds: string[] = [];
  if (body.department === "concerts" || body.department === "contracts") {
    if (!Array.isArray(body.targetIds) || !body.targetIds.length || body.targetIds.length > 40) throw new ApiError("اختر من 1 إلى 40 جهة مستفيدة");
    targetIds = body.targetIds.map(voucherId); if(new Set(targetIds).size!==targetIds.length) throw new ApiError("توجد جهات مكررة");
  }
  return { date: exportExpenseDate(body.date,"تاريخ السند"), department: body.department as ExpenseVoucher["department"], recipient: short(body.recipient,"اسم المستلم"), type: short(body.type,"نوع المصروف"), kind: body.kind as ExpenseVoucher["kind"], method: body.method as ExpenseVoucher["method"], description: short(body.description??"","الوصف",500,false), source: body.source as ExpenseVoucher["source"], invoiceId: body.source === "inventory" ? voucherId(body.invoiceId) : "", amount, vatMode, vatRate, ...totals, targetIds };
}
async function loadTargets(db: Firestore, tx: Transaction, department: ExpenseVoucher["department"], ids: string[]) {
  if (department === "general" || department === "restaurant") return [{id:department,name:VOUCHER_DEPARTMENTS[department],number:""}];
  const snaps = await Promise.all(ids.map(id => tx.get(db.collection(department).doc(id))));
  return snaps.map(s => {
    if(!s.exists) throw new ApiError("إحدى الجهات المستفيدة غير موجودة"); const d=s.data()!;
    if(d.status==="cancelled" || department==="concerts" && !["confirmed","completed"].includes(d.status)) throw new ApiError("اختر حفلات مؤكدة أو مكتملة وعقودًا غير ملغاة");
    return {id:s.id,name:toLatinDigits(String(d.name||d.clientName||s.id)),number:toLatinDigits(String(d.concertNumber??d.contractNumber??""))};
  });
}
/** Recompute the same cached concert fields used by financial exports. All reads
 * happen before writes; snapshots on voucher mirrors never inherit sale VAT. */
async function prepareConcertMirrors(db: Firestore, tx: Transaction, v: ExpenseVoucher, enabled: boolean) {
  if(v.department!=="concerts") return () => {};
  const settings=await tx.get(db.collection("expense_settings").doc("config"));
  const kinds=new Map((settings.data()?.types??[]).map((t:{name:string;kind:string})=>[t.name,t.kind]));
  const prepared = await Promise.all(v.allocations.map(async a => {
    const cRef=db.collection("concerts").doc(a.id), c=await tx.get(cRef);
    const list=await tx.get(db.collection("concert_expenses").where("concertId","==",a.id));
    const mirrorId=`voucher_${v.id}_${a.id}`;
    const data={concertId:a.id,concertNumber:c.data()?.concertNumber??null,clientName:a.name,type:v.type,kind:v.kind,description:v.description,supplierName:v.recipient,amount:enabled&&v.source==="direct"?a.gross/100:0,vatIncluded:v.vatMode!=="none",invoiceDate:v.date,createdAt:Timestamp.fromDate(new Date(v.createdAt)),createdBy:v.createdBy,voucherId:v.id,snapshotNetAmount:enabled&&v.source==="direct"?a.net/100:0};
    const totals={transportCost:0,laborCost:0,otherExpensesCost:0};
    const expenses=[...list.docs.filter(d=>d.id!==mirrorId).map(d=>d.data()),data];
    for(const e of expenses){const net=typeof e.snapshotNetAmount==="number"?e.snapshotNetAmount:e.vatIncluded?Math.round(e.amount/(1+(c.data()?.vatRate??15)/100)*100)/100:e.amount??0;const kind=e.voucherId?e.kind:kinds.get(e.type);const key=kind==="transport"?"transportCost":kind==="labor"?"laborCost":"otherExpensesCost";totals[key]+=net;}
    return {cRef,exists:c.exists,mirrorId,data,totals};
  }));
  return () => {for(const p of prepared){tx.set(db.collection("concert_expenses").doc(p.mirrorId),p.data);if(p.exists)tx.update(p.cRef,Object.fromEntries(Object.entries(p.totals).map(([k,n])=>[k,Math.round(n*100)/100||null])));}};
}
export async function saveVoucher(db:Firestore,uid:string,id:string,input:Record<string,unknown>,revision:unknown) {
  const clean=cleanVoucher(input), now=new Date().toISOString(), ref=db.collection("expense_vouchers").doc(voucherId(id));
  return db.runTransaction(async tx=>{
    const old=await tx.get(ref); const previous=old.data() as ExpenseVoucher|undefined;
    if(previous && (previous.state!=="draft" || previous.revision!==revision)) throw new ApiError("تغير السند أو تم اعتماده؛ أعد فتحه",409);
    const targets=await loadTargets(db,tx,clean.department,clean.targetIds);
    const {targetIds:unused,...fields}=clean; void unused;
    const voucher:ExpenseVoucher={...fields,id:ref.id,state:"draft",number:null,revision:(previous?.revision??0)+1,allocations:splitVoucher(clean.gross,clean.tax,targets),targetKeys:targets.map(t=>`${clean.department}:${t.id}`),refunded:0,createdBy:previous?.createdBy??uid,createdAt:previous?.createdAt??now,updatedAt:now,events:previous?.events??[]};
    tx.set(ref,voucher); return voucher;
  });
}
export async function approveVoucher(db:Firestore,uid:string,id:string,revision:unknown) {
  const ref=db.collection("expense_vouchers").doc(voucherId(id));
  return db.runTransaction(async tx=>{
    const s=await tx.get(ref);if(!s.exists)throw new ApiError("السند غير موجود",404);
    const v=s.data() as ExpenseVoucher;
    if(v.state==="posted")return v; // same approval retried after a lost response
    if(v.state!=="draft"||v.revision!==revision)throw new ApiError("تغير السند؛ أعد فتحه",409);
    await loadTargets(db,tx,v.department,v.allocations.map(a=>a.id));
    const countRef=db.collection("counters").doc(`expense_vouchers_${v.date.slice(0,4)}`), counter=await tx.get(countRef);
    const seq=(counter.data()?.value??0)+1;
    if(!Number.isSafeInteger(seq)||seq>99999999)throw new ApiError("تعذر ترقيم سند الصرف");
    let invoice:FirebaseFirestore.DocumentReference|undefined;
    if(v.source==="inventory"){
      invoice=db.collection("cost_purchase_invoices").doc(v.invoiceId);const i=await tx.get(invoice);
      if(!i.exists)throw new ApiError("اختر فاتورة وارد معتمدة موجودة بالمخزون");
      if(i.data()?.expenseVoucherId)throw new ApiError("فاتورة الوارد مرتبطة بسند صرف سابق");
      if(expenseHalalas(i.data()?.totalBeforeVat,"صافي فاتورة الوارد")!==v.net)throw new ApiError("صافي السند لا يطابق فاتورة الوارد؛ يمنع تسجيل تكلفة أو مبلغ مكرر");
      const entries=await tx.get(db.collection("cost_incoming").where(i.data()?.materialReceiptId?"materialReceiptId":"invoiceId","==",i.data()?.materialReceiptId||v.invoiceId).limit(501));
      if(entries.size>500||entries.empty||entries.size!==i.data()?.lineCount||entries.docs.reduce((sum,e)=>sum+expenseHalalas(e.data().totalBeforeVat,"قيمة سطر الوارد"),0)!==v.net)throw new ApiError("تفاصيل الوارد لا تطابق إجمالي الفاتورة؛ راجع الفاتورة قبل اعتماد سدادها");
    }
    const posted:ExpenseVoucher={...v,state:"posted",number:`PV-${v.date.slice(0,4)}-${String(seq).padStart(6,"0")}`,revision:v.revision+1,approvedBy:uid,updatedAt:new Date().toISOString()};
    posted.events=[...v.events,{at:posted.updatedAt,by:uid,action:"approve",reason:"اعتماد صرف مدفوع فعليًا"}];
    const mirrors=await prepareConcertMirrors(db,tx,posted,true);
    tx.set(countRef,{value:seq});tx.set(ref,posted);if(invoice)tx.update(invoice,{expenseVoucherId:id});mirrors();return posted;
  });
}
export async function voidVoucher(db:Firestore,uid:string,id:string,revision:unknown,reason:unknown) {
  const why=short(reason,"سبب إلغاء القيد",500),ref=db.collection("expense_vouchers").doc(voucherId(id));
  return db.runTransaction(async tx=>{
    const s=await tx.get(ref);if(!s.exists)throw new ApiError("السند غير موجود",404);const v=s.data() as ExpenseVoucher;
    if(v.state==="void")return v;if(v.revision!==revision)throw new ApiError("تغير السند؛ أعد فتحه",409);
    if(v.refunded||v.events.some(e=>e.action==="settle"))throw new ApiError("السند مرتبط بتسوية؛ لا يمكن إلغاء قيده بعد التسوية");
    const mirrors=v.state==="posted"?await prepareConcertMirrors(db,tx,v,false):()=>{};
    const invoiceRef=v.source==="inventory"?db.collection("cost_purchase_invoices").doc(v.invoiceId):null;
    const invoice=invoiceRef?await tx.get(invoiceRef):null;
    const now=new Date().toISOString(),next:ExpenseVoucher={...v,state:"void",revision:v.revision+1,updatedAt:now,events:[...v.events,{at:now,by:uid,action:"void",reason:why}]};
    // A void is correction of an erroneous entry, not proof of a cash refund.
    tx.set(ref,next);if(invoiceRef&&invoice?.data()?.expenseVoucherId===id)tx.update(invoiceRef,{expenseVoucherId:null});mirrors();return next;
  });
}
export async function settleVoucher(db:Firestore,uid:string,id:string,input:Record<string,unknown>) {
  const ref=db.collection("expense_vouchers").doc(voucherId(id)),target=voucherId(input.target),why=short(input.reason,"سبب التسوية",500),mode=input.mode;
  if(!["consumed","redistributed","refunded"].includes(String(mode)))throw new ApiError("اختر مصير المصروف");
  return db.runTransaction(async tx=>{
    const s=await tx.get(ref);if(!s.exists)throw new ApiError("السند غير موجود",404);const v=s.data() as ExpenseVoucher;
    if(v.state!=="posted"||v.department!=="concerts"||v.source!=="direct")throw new ApiError("التسوية لمصروفات الحفلات المعتمدة المباشرة فقط");
    if(v.revision!==input.revision)throw new ApiError("تغير السند؛ أعد فتحه",409);
    const a=v.allocations.find(a=>a.id===target);if(!a||a.settlement&&mode!=="refunded")throw new ApiError("الحصة غير موجودة أو سبق تسويتها؛ يمكن تسجيل استرداد فعلي لاحق للحصة المتبقية");
    let allocations:VoucherAllocation[]=v.allocations.map(a=>({...a})),refund=0;
    if(mode==="redistributed"){
      const remaining=allocations.filter(b=>b.id!==target&&!b.settlement);
      if(!remaining.length)throw new ApiError("لا توجد حفلات مستفيدة أخرى لإعادة التوزيع");
      await loadTargets(db,tx,"concerts",remaining.map(b=>b.id));
      const redistributed=splitVoucher(a.gross,a.tax,remaining);
      allocations=allocations.map(b=>{if(b.id===target)return{...b,gross:0,net:0,tax:0,settlement:"redistributed"};const share=redistributed.find(x=>x.id===b.id);return share?{...b,gross:b.gross+share.gross,net:b.net+share.net,tax:b.tax+share.tax}:b;});
    }else if(mode==="refunded"){
      refund=expenseHalalas(input.amount,"المبلغ المسترد فعليًا");if(refund<=0||refund>a.gross)throw new ApiError("المسترد يجب أن يكون أكبر من صفر وألا يتجاوز الحصة");
      exportExpenseDate(input.refundDate,"تاريخ الاسترداد");short(input.refundMethod,"طريقة الاسترداد");
      if(!Object.values(VOUCHER_METHODS).includes(input.refundMethod as typeof VOUCHER_METHODS[keyof typeof VOUCHER_METHODS]))throw new ApiError("طريقة الاسترداد غير صحيحة");
      const tax=voucherRatio(a.tax,refund,a.gross);
      allocations=allocations.map(b=>b.id===target?{...b,gross:b.gross-refund,tax:b.tax-tax,net:b.net-refund+tax,settlement:"refunded"}:b);
    }else allocations=allocations.map(b=>b.id===target?{...b,settlement:"consumed"}:b);
    const at=new Date().toISOString(),next:ExpenseVoucher={...v,allocations,refunded:v.refunded+refund,revision:v.revision+1,updatedAt:at,events:[...v.events,{at,by:uid,action:"settle",target,amount:refund,reason:`${mode}: ${why}${refund?` | ${input.refundDate} | ${input.refundMethod}`:""}`}]};
    if(allocations.reduce((sum,a)=>sum+a.gross,0)!==v.gross-next.refunded)throw new ApiError("تعذرت مطابقة التسوية");
    const mirrors=await prepareConcertMirrors(db,tx,next,true);tx.set(ref,next);mirrors();return next;
  });
}
export async function voucherList(db:Firestore,from:string,to:string,cursor:string) {
  let q:FirebaseFirestore.Query=db.collection("expense_vouchers").orderBy("date","desc").orderBy(FieldPath.documentId(),"desc");
  if(from)q=q.where("date",">=",exportExpenseDate(from,"من تاريخ"));if(to)q=q.where("date","<=",exportExpenseDate(to,"إلى تاريخ"));if(from&&to&&from>to)throw new ApiError("فترة غير صحيحة");
  if(cursor){try{const c=JSON.parse(Buffer.from(cursor,"base64url").toString());q=q.startAfter(exportExpenseDate(c.date,"الفهرس"),voucherId(c.id));}catch{throw new ApiError("فهرس الصفحة غير صحيح");}}
  const snap=await q.limit(21).get(),rows=snap.docs.slice(0,20).map(s=>s.data() as ExpenseVoucher),last=rows.at(-1);
  return{rows,nextCursor:snap.size>20&&last?Buffer.from(JSON.stringify({date:last.date,id:last.id})).toString("base64url"):null};
}
export async function voucherCosts(db:Firestore,key?:string) {
  const q=key?db.collection("expense_vouchers").where("targetKeys","array-contains",key):db.collection("expense_vouchers");
  const snap=await q.limit(5001).get();if(snap.size>5000)throw new ApiError("تجاوزت السندات حد التقرير؛ يلزم تقسيم الفترة");
  return snap.docs.map(d=>d.data() as ExpenseVoucher).filter(v=>v.state==="posted"&&v.source==="direct");
}
