import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireCaller, requirePage, require_, withActivityResponse } from "@/lib/server/guard";
import { materialRequestPrintData } from "@/lib/server/material-requests-core";
import { renderMaterialRequestPdf } from "@/lib/server/material-request-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  return withActivityResponse(async () => {
    try {
      const caller = await requireCaller(req);
      requirePage(caller, "costs", "طلبات المواد");
      require_(caller, "costs", "mat_print", "طباعة طلب المواد");
      if (!["mat_view", "mat_view_all", "mat_create"].some(key => caller.feat("costs", key))) throw new ApiError("لا تملك صلاحية عرض طلب المواد", 403);
      const body = await req.json();
      const data = await materialRequestPrintData(caller.db, caller.uid, caller.feat("costs", "mat_view_all"), body?.id, body?.section);
      const pdf = await renderMaterialRequestPdf(data.request, data.lines, data.section, data.assignee);
      return new NextResponse(pdf as unknown as BodyInit, { headers: {
        "Content-Type": "application/pdf", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="material-request.pdf"; filename*=UTF-8''${encodeURIComponent(`طلب-مواد-${data.request.requestDate}.pdf`)}`,
      } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof ApiError ? error.message : "تعذرت طباعة الطلب؛ أعد المحاولة" }, { status: error instanceof ApiError ? error.status : 500 });
    }
  });
}
