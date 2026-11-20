import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireCaller, requirePage, require_, withActivityResponse } from "@/lib/server/guard";
import { expenseExportFilters, readExpenseExport } from "@/lib/server/expenses-export";
import { buildExpensesWorkbook } from "@/lib/server/expenses-workbook";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  return withActivityResponse(async () => {
    try {
      const caller = await requireCaller(req);
      requirePage(caller, "finances", "المالية");
      require_(caller, "finances", "expenses_export", "تصدير جميع المصاريف (الحفلات والتعاقدات)");
      const body = await req.json(), filters = expenseExportFilters(body?.filters);
      const rows = await readExpenseExport(caller.db, filters);
      const book = await buildExpensesWorkbook(rows, filters);
      const buffer = await book.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer) as BodyInit, { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="all-expenses.xlsx"; filename*=UTF-8''${encodeURIComponent("جميع-المصاريف.xlsx")}`,
        "Cache-Control": "no-store",
      } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof ApiError ? error.message : "تعذر إنشاء ملف المصاريف؛ أعد المحاولة" }, { status: error instanceof ApiError ? error.status : 500 });
    }
  });
}
