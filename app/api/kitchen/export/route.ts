import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireCaller, requirePage, require_, withActivityResponse } from "@/lib/server/guard";
import { buildKitchenSummaryWorkbook } from "@/lib/server/kitchen-export";
import { matchesKitchenExportOrder, type KitchenExportOrder, type KitchenExportFilters } from "@/lib/kitchen-export";
import { riyadhDateString } from "@/lib/event-date";
export const dynamic="force-dynamic";
export async function POST(req: NextRequest) {
  return withActivityResponse(async()=>{
    try {
      const caller=await requireCaller(req);
      requirePage(caller,"kitchen","عرض طلبات المطبخ");
      require_(caller,"kitchen","export","تصدير تجميع أصناف المطبخ");
      const body=await req.json();
      if(!Array.isArray(body.orderIds)||!body.orderIds.length||body.orderIds.length>1000||body.orderIds.some((id:unknown)=>typeof id!=="string"||!id||id.includes("/")||id.length>150)) throw new ApiError("اختر من 1 إلى 1000 طلب صحيح");
      if(new Set(body.orderIds).size!==body.orderIds.length) throw new ApiError("تكررت طلبات التصدير");
      const date=body.filters?.date;
      if(!date||!["all","today","week","next-week","month","custom"].includes(date.mode)||typeof date.from!=="string"||typeof date.to!=="string") throw new ApiError("فلتر التاريخ غير صحيح");
      for(const value of [date.from,date.to]) {
        if(!value)continue;
        const parsed=new Date(value+"T00:00:00Z");
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new ApiError("تاريخ الفلتر غير صحيح");
      }
      if(date.from&&date.to&&date.from>date.to)throw new ApiError("تاريخ البداية يجب أن يسبق النهاية");
      const filters:KitchenExportFilters={date,search:typeof body.filters?.search==="string"?body.filters.search.slice(0,120):""};
      const snaps=await caller.db.getAll(...body.orderIds.map((id:string)=>caller.db.collection("kitchen_orders").doc(id)));
      const orders=snaps.map(s=>({id:s.id,...s.data()} as KitchenExportOrder));
      if(snaps.some(s=>!s.exists)||orders.some(o=>o.status!=="received"||!matchesKitchenExportOrder(o,filters)))throw new ApiError("تغيّرت الطلبات أو يوجد اختيار خارج الفلاتر أو غير مستلم — حدّث الصفحة وأعد الاختيار");
      const wb=buildKitchenSummaryWorkbook(orders,filters);
      const buffer=await wb.xlsx.writeBuffer();
      return new NextResponse(buffer as ArrayBuffer,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="kitchen-summary.xlsx"; filename*=UTF-8''${encodeURIComponent(`تجميع-المطبخ-${riyadhDateString(new Date())}.xlsx`)}`,"Cache-Control":"no-store"}});
    } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر التصدير"},{status:error instanceof ApiError?error.status:400});}
  });
}
