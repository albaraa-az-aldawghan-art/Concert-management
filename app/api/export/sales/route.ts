import { withActivityResponse } from "@/lib/server/guard";
/* تصدير المبيعات: ملف إكسل لسنة كاملة — اثنتا عشرة ورقة شهرية وورقة ملخص. */

import { NextRequest, NextResponse } from "next/server";
import { authorizeExport, yearFrom } from "@/lib/server/export-auth";
import { buildSalesWorkbook } from "@/lib/server/export-core";
import { ApiError } from "@/lib/server/guard";
import type { SalesExportScope } from "@/lib/sales-export-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function download(req: NextRequest) {
  try {
    if (req.method === "POST" && new URL(req.url).searchParams.has("key")) throw new ApiError("سجّل الدخول لتصدير الفلاتر", 403);
    const db = await authorizeExport(req, "concerts", "المبيعات");
    const year = yearFrom(req);
    const cols = new URL(req.url).searchParams.get("cols");
    let scope: SalesExportScope | undefined;
    if (req.method === "POST") {
      // Filtered downloads require a signed session, never a bearer link key.
      const body = await req.json();
      const value = body?.scope;
      if (!value || !Array.isArray(value.concertIds) || value.concertIds.length < 1 || value.concertIds.length > 10000 ||
          value.concertIds.some((id: unknown) => typeof id !== "string" || !id || id.length > 128 || id.includes("/")) ||
          new Set(value.concertIds).size !== value.concertIds.length ||
          !["date", "createdAt"].includes(value.dateField) || typeof value.financialOnly !== "boolean" ||
          [value.from, value.to].some(d => typeof d !== "string" || (d !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d).toISOString().slice(0, 10) !== d))) ||
          (value.from && value.to && value.from > value.to)) {
        throw new ApiError("فلاتر التصدير غير صحيحة", 400);
      }
      scope = value;
    }
    const wb = await buildSalesWorkbook(db, year, cols, scope);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // اسم الملف بالعربية يحتاج ترميزاً كي لا تتشوّه حروفه
        "Content-Disposition": `attachment; filename="sales-${scope ? "filtered" : year}.xlsx"; filename*=UTF-8''${encodeURIComponent(scope ? "المبيعات-الفترة-المختارة.xlsx" : `المبيعات-${year}.xlsx`)}`,
        // الرابط الدائم يجب أن يعيد أحدث البيانات لا نسخة مخبّأة
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}

export async function GET(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}

export async function POST(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}
