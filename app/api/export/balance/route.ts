/* تصدير رصيد الأصناف: جرد لحظي — ورقة واحدة بلا بُعد زمني (لا "سنة" هنا). */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireCaller, ApiError } from "@/lib/server/guard";
import { verifyExportKey } from "@/lib/server/export-keys";
import { buildBalanceWorkbook } from "@/lib/server/export-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const key = new URL(req.url).searchParams.get("key");
    let includeValue: boolean;
    let db;
    if (key) {
      // رابط دائم: لا يُنشئه إلا مدير أصلاً، فالقيمة تُضمّ معه دائماً
      db = getAdminDb();
      await verifyExportKey(db, key);
      includeValue = true;
    } else {
      const caller = await requireCaller(req);
      if (!caller.isAdmin && !caller.feat("costs", "export")) {
        throw new ApiError("لا تملك صلاحية تصدير رصيد الأصناف", 403);
      }
      includeValue = caller.isAdmin || caller.feat("costs", "bf_value");
      db = caller.db;
    }

    const wb = await buildBalanceWorkbook(db, includeValue);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="balance.xlsx"; filename*=UTF-8''${encodeURIComponent("رصيد الأصناف.xlsx")}`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}
