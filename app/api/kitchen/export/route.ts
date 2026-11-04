import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireCaller, requirePage, require_, withActivityResponse } from "@/lib/server/guard";
import { matchesKitchenExportOrder, kitchenCategory, kitchenSelectionNotices, aggregateKitchenOrders, type KitchenExportOrder, type KitchenExportFilters } from "@/lib/kitchen-export";
import { prepareKitchenSelection } from "@/lib/server/kitchen-export-selection";
import { riyadhDateString } from "@/lib/event-date";
import { renderKitchenSummaryPdf } from "@/lib/server/kitchen-pdf";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req: NextRequest) {
  return withActivityResponse(async()=>{
    try {
      const caller=await requireCaller(req);
      requirePage(caller,"kitchen","عرض طلبات المطبخ");
      require_(caller,"kitchen","export","تصدير تجميع أصناف المطبخ");
      const body=await req.json();
      if(body.format!==undefined&&body.format!=="pdf")throw new ApiError("التصدير متاح بصيغة PDF فقط");
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
      const categories=body.filters?.categories;
      if(categories!==undefined&&(!Array.isArray(categories)||categories.length>200||categories.some((category:unknown)=>typeof category!=="string"||!category.trim()||category.length>200)))throw new ApiError("فلتر الأقسام غير صحيح");
      const filters:KitchenExportFilters={date,search:typeof body.filters?.search==="string"?body.filters.search.slice(0,120):"",...(categories!==undefined?{categories:[...new Set<string>(categories.map(kitchenCategory))]}:{})};
      const snaps=await caller.db.getAll(...body.orderIds.map((id:string)=>caller.db.collection("kitchen_orders").doc(id)));
      const orders=snaps.map(s=>({id:s.id,...s.data()} as KitchenExportOrder));
      if(snaps.some(s=>!s.exists)||orders.some(o=>!["sent","received"].includes(o.status)||!matchesKitchenExportOrder(o,filters)))throw new ApiError("تغيّرت الطلبات أو يوجد اختيار خارج الفلاتر — حدّث الصفحة وأعد الاختيار");
      const prepared=await prepareKitchenSelection(caller.db,orders,filters.categories);
      const notices=kitchenSelectionNotices(prepared.candidates,body.orderIds,filters.categories);
      if(body.preview===true)return NextResponse.json({candidates:prepared.candidates,notices,includedCount:prepared.orders.length},{headers:{"Cache-Control":"no-store"}});
      if(!prepared.orders.length)return NextResponse.json({error:"لا توجد أصناف قابلة للتصدير بعد تطبيق الاختيار واستبعاد الملغاة والفارغة",notices},{status:400});
      aggregateKitchenOrders(prepared.orders,true);
      const unspecified=prepared.orders.reduce((sum,order)=>sum+(order.lines??[]).filter(line=>line.quantity==null).length,0);
      const pdf=await renderKitchenSummaryPdf(prepared.orders,filters);
      return new NextResponse(pdf as unknown as BodyInit,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="kitchen-summary.pdf"; filename*=UTF-8''${encodeURIComponent(`تجميع-المطبخ-${riyadhDateString(new Date())}.pdf`)}`,"Cache-Control":"no-store","X-Kitchen-Unspecified-Lines":String(unspecified),"X-Kitchen-Skipped-Orders":String(notices.length)}});
    } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر التصدير"},{status:error instanceof ApiError?error.status:400});}
  });
}
