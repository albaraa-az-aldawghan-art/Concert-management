import { NextRequest } from "next/server";
import { requireCaller, handle, str, num, optStr, ApiError } from "@/lib/server/guard";
import { svcReportMissing } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** بلاغ مفقودات — يُرفض إن تجاوز ما أُخذ للحفلة أصلاً */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const allowed =
      /* لا استثناء بالاسم — نزعُ الإجراء من الدور يجب أن يمنعه فعلاً */
      caller.feat("supervisor", "report_missing") || caller.feat("missing_items", "resolve");
    if (!allowed) throw new ApiError("لا تملك صلاحية تسجيل المفقودات", 403);

    return svcReportMissing(caller.db, {
      concertId: str(body.concertId, "الحفلة"),
      concertNumber: body.concertNumber != null ? Number(body.concertNumber) : null,
      itemId: str(body.itemId, "المادة"),
      itemName: str(body.itemName, "اسم المادة"),
      missingCount: num(body.missingCount, "عدد المفقود", { positive: true }),
      employeeId: optStr(body.employeeId),
      employeeName: optStr(body.employeeName),
      notes: optStr(body.notes, 500),
      reportedBy: caller.uid,
    });
  });
}
