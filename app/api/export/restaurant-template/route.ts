/* تنزيل قالب منصرف المطعم — لا "تصدير" بالمعنى المعتاد، بل جزء من
   آلية تسجيل المنصرف نفسها: نفس صلاحية التسجيل تفتحه لا صلاحية تصدير
   منفصلة. */

import { NextRequest, NextResponse } from "next/server";
import { requireCaller, require_, ApiError } from "@/lib/server/guard";
import { buildRestaurantTemplateWorkbook } from "@/lib/server/export-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    require_(caller, "costs", "out_add", "تسجيل المنصرف");

    const wb = await buildRestaurantTemplateWorkbook(caller.db);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="restaurant-template.xlsx"; filename*=UTF-8''${encodeURIComponent("قالب منصرف المطعم.xlsx")}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
