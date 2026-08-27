/* تصدير الموارد: جرد لحظي — ورقة واحدة بلا بُعد زمني (لا "سنة" هنا). */

import { NextRequest, NextResponse } from "next/server";
import { authorizeExport } from "@/lib/server/export-auth";
import { buildWarehouseWorkbook } from "@/lib/server/export-core";
import { ApiError } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const db = await authorizeExport(req, "warehouse", "الموارد");
    const wb = await buildWarehouseWorkbook(db);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="warehouse.xlsx"; filename*=UTF-8''${encodeURIComponent("الموارد.xlsx")}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
