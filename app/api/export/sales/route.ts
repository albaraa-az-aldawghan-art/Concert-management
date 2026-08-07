/* تصدير المبيعات: ملف إكسل لسنة كاملة — اثنتا عشرة ورقة شهرية وورقة ملخص. */

import { NextRequest, NextResponse } from "next/server";
import { authorizeExport, yearFrom } from "@/lib/server/export-auth";
import { buildSalesWorkbook } from "@/lib/server/export-core";
import { ApiError } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const db = await authorizeExport(req, "concerts", "المبيعات");
    const year = yearFrom(req);
    const cols = new URL(req.url).searchParams.get("cols");

    const wb = await buildSalesWorkbook(db, year, cols);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // اسم الملف بالعربية يحتاج ترميزاً كي لا تتشوّه حروفه
        "Content-Disposition": `attachment; filename="sales-${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(`المبيعات-${year}.xlsx`)}`,
        // الرابط الدائم يجب أن يعيد أحدث البيانات لا نسخة مخبّأة
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
