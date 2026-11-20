import { NextRequest,NextResponse } from "next/server";
import { ApiError,requireCaller,requirePage,require_,withActivityResponse } from "@/lib/server/guard";
import { cleanMaterialExportFilters,materialExportCandidates,materialExportData } from "@/lib/server/material-requests-export";
import { buildMaterialRequestsWorkbook,materialExportColumns } from "@/lib/server/material-requests-workbook";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:NextRequest) {
  return withActivityResponse(async()=>{
    try {
      const caller=await requireCaller(req);requirePage(caller,"costs","طلبات المواد");require_(caller,"costs","mat_export","تصدير طلبات المواد إلى Excel");
      if(!["mat_view","mat_view_all","mat_create"].some(k=>caller.feat("costs",k)))throw new ApiError("لا تملك صلاحية عرض طلبات المواد",403);
      const body=await req.json(),filters=cleanMaterialExportFilters(body?.filters);
      const columns=body.preview===true?[]:materialExportColumns(body.columns);
      if(body.summary!==undefined&&typeof body.summary!=="boolean"||body.arrivals!==undefined&&typeof body.arrivals!=="boolean")throw new ApiError("خيارات أوراق التصدير غير صحيحة");
      const candidates=await materialExportCandidates(caller.db,caller.uid,caller.feat("costs","mat_view_all"),filters);
      if(body.preview===true)return NextResponse.json({requests:candidates.map(r=>({id:r.id,number:r.number,requestDate:r.requestDate,state:r.state,section:r.section??"general",assignedToName:r.assignedToName??null,materials:r.lines.map(l=>l.name).join("، ")}))},{headers:{"Cache-Control":"no-store"}});
      const data=await materialExportData(caller.db,candidates,body.requestIds,filters);
      const book=await buildMaterialRequestsWorkbook(data,columns,body.summary!==false,body.arrivals!==false);
      const buffer=await book.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer) as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="material-requests.xlsx"; filename*=UTF-8''${encodeURIComponent("طلبات-المواد.xlsx")}`,"Cache-Control":"no-store"}});
    }catch(error){return NextResponse.json({error:error instanceof ApiError?error.message:"تعذر إنشاء ملف Excel؛ أعد المحاولة"},{status:error instanceof ApiError?error.status:500});}
  });
}
