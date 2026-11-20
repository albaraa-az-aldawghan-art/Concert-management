import type { Firestore } from "firebase-admin/firestore";
import { ApiError } from "./guard";
import { listMaterialRequests, materialDate, materialId } from "./material-requests-core";
import { materialSearchKeys } from "./material-stock-transaction";
import { MATERIAL_STATES, materialRound, materialSearchKey, type MaterialRequest, type MaterialReceipt } from "../material-requests";
import { inMaterialPeriod, type MaterialExportFilters, type MaterialExportData } from "../material-requests-export";

export function cleanMaterialExportFilters(input: unknown): MaterialExportFilters {
  if (!input || typeof input!=="object" || Array.isArray(input)) throw new ApiError("فلاتر التصدير غير صحيحة");
  const f=input as Record<string,unknown>;
  if(f.basis!=="request"&&f.basis!=="delivery")throw new ApiError("اختر أساس الفترة: تاريخ الطلب أو التوريد");
  const from=f.from?materialDate(f.from,"من تاريخ"):"",to=f.to?materialDate(f.to,"إلى تاريخ"):"";
  if(from&&to&&from>to)throw new ApiError("تاريخ البداية يجب أن يسبق النهاية");
  if(f.q!==undefined&&(typeof f.q!=="string"||f.q.length>64))throw new ApiError("البحث طويل؛ استخدم بداية الاسم أو الباركود");
  if(f.state!==undefined&&f.state!==""&&(typeof f.state!=="string"||!Object.hasOwn(MATERIAL_STATES,f.state)))throw new ApiError("حالة الطلب غير صحيحة");
  return {basis:f.basis,from,to,q:typeof f.q==="string"?f.q.trim():"",state:typeof f.state==="string"?f.state:""};
}
export async function materialExportCandidates(db:Firestore,uid:string,all:boolean,filters:MaterialExportFilters):Promise<MaterialRequest[]> {
  if(filters.basis==="request") {
    const page=await listMaterialRequests(db,uid,all,filters,200);
    if(page.nextCursor)throw new ApiError("تجاوزت النتائج 200 طلب؛ ضيّق الفترة أو البحث ثم أعد التصدير");
    return page.rows as MaterialRequest[];
  }
  // Bound arrival reads before resolving request access. No receipt data is returned in previews.
  let query=db.collection("cost_material_receipts").orderBy("receivedDate","desc");
  if(filters.from)query=query.where("receivedDate",">=",filters.from);
  if(filters.to)query=query.where("receivedDate","<=",filters.to);
  const snapshot=await query.limit(1001).get();
  if(snapshot.size>1000)throw new ApiError("تجاوزت الفترة 1000 دفعة توريد؛ اختر فترة أقصر");
  const ids=[...new Set(snapshot.docs.filter(d=>d.data().state!=="void").map(d=>String(d.data().requestId)))];
  if(ids.length>200)throw new ApiError("تجاوزت الفترة 200 طلب؛ اختر فترة أقصر");
  if(!ids.length)return [];
  const snaps=await db.getAll(...ids.map(id=>db.collection("cost_material_requests").doc(materialId(id))));
  return snaps.filter(s=>s.exists).map(s=>({id:s.id,...s.data()} as MaterialRequest)).filter(r=>
    (all||r.createdBy===uid||r.assignedTo===uid)&&(!filters.state||r.state===filters.state)&&
    (!filters.q||materialSearchKeys(r.number,r.lines).includes(materialSearchKey(filters.q)))
  ).sort((a,b)=>b.requestDate.localeCompare(a.requestDate)||b.id.localeCompare(a.id));
}
export async function materialExportData(db:Firestore, requests:MaterialRequest[], selected:unknown, filters:MaterialExportFilters):Promise<MaterialExportData> {
  if(!Array.isArray(selected)||!selected.length||selected.length>200||new Set(selected).size!==selected.length)throw new ApiError("اختر من 1 إلى 200 طلب دون تكرار");
  const wanted=selected.map(id=>materialId(id)),available=new Map(requests.map(r=>[r.id,r]));
  if(wanted.some(id=>!available.has(id)))throw new ApiError("أحد الطلبات خارج الفلاتر أو الصلاحيات الحالية؛ حدّث قائمة التصدير",403);
  const chosen=requests.filter(r=>wanted.includes(r.id));
  const receipts:MaterialReceipt[]=[];
  for(let offset=0;offset<wanted.length;offset+=30) {
    const snap=await db.collection("cost_material_receipts").where("requestId","in",wanted.slice(offset,offset+30)).limit(1001-receipts.length).get();
    receipts.push(...snap.docs.map(d=>({id:d.id,...d.data()} as MaterialReceipt)));
    if(receipts.length>1000)throw new ApiError("تجاوزت الدفعات 1000 سجل؛ حدد طلبات أقل");
  }
  // Reconcile active receipts against request counters before generating a file.
  for(const request of chosen)for(const line of request.lines) {
    const active=receipts.filter(r=>r.requestId===request.id&&r.state!=="void");
    const received=materialRound(active.reduce((sum,r)=>sum+(r.lines.find(l=>l.barcode===line.barcode)?.quantity??0),0));
    const posted=materialRound(active.filter(r=>r.state==="posted").reduce((sum,r)=>sum+(r.lines.find(l=>l.barcode===line.barcode)?.quantity??0),0));
    if(Math.abs(received-line.received)>0.001||Math.abs(posted-line.posted)>0.001)throw new ApiError(`تعذرت مطابقة كميات الطلب ${request.number} مع دفعاته؛ حدّثه وأعد المحاولة`);
  }
  if(filters.basis==="delivery"&&chosen.some(r=>!receipts.some(s=>s.requestId===r.id&&s.state!=="void"&&inMaterialPeriod(s.receivedDate,filters))))throw new ApiError("تغيّرت تواريخ التوريد؛ أعد تحميل نتائج التصدير",409);
  return {requests:chosen,receipts,filters};
}
