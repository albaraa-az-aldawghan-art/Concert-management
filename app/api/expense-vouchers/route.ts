import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError,handle,requireCaller,require_,requirePage } from "@/lib/server/guard";
import { approveVoucher,saveVoucher,settleVoucher,voidVoucher,voucherId,voucherList,voucherCosts } from "@/lib/server/expense-vouchers-core";
import { expenseExportFilters } from "@/lib/server/expenses-export";
import { eventDateString } from "@/lib/event-date";
import { toLatinDigits } from "@/lib/utils";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){return handle(async()=>{
  const caller=await requireCaller(req),q=req.nextUrl.searchParams;
  if(q.has("restaurantCosts")){requirePage(caller,"restaurant","تكاليف المطعم");return{rows:(await voucherCosts(caller.db,"restaurant:restaurant")).map(v=>({date:v.date,net:v.allocations.reduce((s,a)=>s+a.net,0)}))};}
  requirePage(caller,"finances","المالية");
  if(q.has("report"))return{rows:(await voucherCosts(caller.db)).map(v=>({date:v.date,createdAt:v.createdAt,department:v.department,net:v.allocations.reduce((s,a)=>s+a.net,0),allocations:v.allocations.map(a=>({id:a.id,net:a.net}))}))};
  require_(caller,"finances","expenses_view","عرض المصاريف وسندات الصرف");
  if(q.has("id")){const s=await caller.db.collection("expense_vouchers").doc(voucherId(q.get("id"))).get();if(!s.exists)throw new ApiError("السند غير موجود",404);return{voucher:s.data()};}
  if(q.has("choices")){
    require_(caller,"finances","expenses_create","إنشاء سند صرف");
    const department=q.get("choices"),filters=expenseExportFilters({from:q.get("from")||"",to:q.get("to")||""});
    if(department==="invoices"){
      const s=await caller.db.collection("cost_purchase_invoices").orderBy("invoiceDate","desc").limit(101).get();
      return{rows:s.docs.slice(0,100).filter(d=>!d.data().expenseVoucherId).map(d=>({id:d.id,name:toLatinDigits(`${d.data().supplierName||"مورد"} - ${d.data().invoiceNumber||"بلا رقم"}`),date:d.data().invoiceDate,amount:d.data().totalBeforeVat})),limited:s.size>100};
    }
    if(department!=="concerts"&&department!=="contracts")throw new ApiError("القسم غير صحيح");
    let query:FirebaseFirestore.Query=caller.db.collection(department);
    if(department==="concerts"){
      if(filters.from)query=query.where("date",">=",Timestamp.fromDate(new Date(filters.from+"T00:00:00+03:00")));
      if(filters.to)query=query.where("date","<",Timestamp.fromDate(new Date(new Date(filters.to+"T00:00:00+03:00").getTime()+86400000)));
    }
    const s=await query.limit(501).get();if(s.size>500)throw new ApiError("تجاوزت القائمة 500 جهة؛ حدد فترة أقصر للحفلات");
    return{rows:s.docs.filter(d=>department==="concerts"?["confirmed","completed"].includes(d.data().status):d.data().status!=="cancelled").map(d=>({id:d.id,name:toLatinDigits(String(d.data().name||d.data().clientName||d.id)),number:toLatinDigits(String(d.data().concertNumber??d.data().contractNumber??"")),date:department==="concerts"?eventDateString(d.data().date):d.data().startDate||""})).sort((a,b)=>a.date.localeCompare(b.date))};
  }
  return voucherList(caller.db,q.get("from")||"",q.get("to")||"",q.get("cursor")||"");
});}
export async function POST(req:NextRequest){return handle(async()=>{
  const body=await req.json(),caller=await requireCaller(req,body);requirePage(caller,"finances","المالية");
  const actions={save:["expenses_create","إنشاء وتعديل مسودة سند"],approve:["expenses_approve","اعتماد صرف السند"],void:["expenses_void","إلغاء قيد سند الصرف"],settle:["expenses_settle","تسوية مصاريف الحفلات عند الإلغاء"]} as const;
  if(!Object.hasOwn(actions,body.action))throw new ApiError("إجراء غير صحيح");
  const permission=actions[body.action as keyof typeof actions];require_(caller,"finances",permission[0],permission[1]);
  const id=voucherId(body.id);
  if(body.action==="save")return{voucher:await saveVoucher(caller.db,caller.uid,id,body.input??{},body.revision)};
  if(body.action==="approve")return{voucher:await approveVoucher(caller.db,caller.uid,id,body.revision)};
  if(body.action==="void")return{voucher:await voidVoucher(caller.db,caller.uid,id,body.revision,body.reason)};
  return{voucher:await settleVoucher(caller.db,caller.uid,id,body.input??{})};
});}
