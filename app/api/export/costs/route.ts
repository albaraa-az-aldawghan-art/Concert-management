/* تصدير التكاليف: حركات كل شهر وأرصدة نهايته، وورقة ملخص للسنة. */

import { NextRequest, NextResponse } from "next/server";
import { authorizeExport, yearFrom } from "@/lib/server/export-auth";
import { buildCostsWorkbook } from "@/lib/server/export-core";
import { ApiError } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const db = await authorizeExport(req, "costs", "التكاليف");
    const year = yearFrom(req);
    const cols = new URL(req.url).searchParams.get("cols");

    const wb = await buildCostsWorkbook(db, year, cols);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="costs-${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(`التكاليف-${year}.xlsx`)}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
