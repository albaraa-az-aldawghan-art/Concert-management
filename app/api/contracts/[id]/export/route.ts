/* تصدير شهر من الجدول اليومي بتخطيط ورقة الإكسل الأصلية. */

import { NextRequest, NextResponse } from "next/server";
import { requireCaller, require_, ApiError } from "@/lib/server/guard";
import { buildContractMonthWorkbook } from "@/lib/server/contract-ledger-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "ledger_export", "تصدير الجدول اليومي");
    const { id } = await params;
    const month = req.nextUrl.searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError("الشهر بصيغة yyyy-mm");

    const { wb, contractName } = await buildContractMonthWorkbook(caller.db, id, month);
    const buf = await wb.xlsx.writeBuffer();
    const name = `${contractName}-${month}.xlsx`;

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contract-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
