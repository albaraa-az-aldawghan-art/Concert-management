/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, str, optStr } from "@/lib/server/guard";
import { approveDispenseRequest, rejectDispenseRequest } from "@/lib/server/dispense-requests-core";

export const dynamic = "force-dynamic";

/** إقرار طلب الصرف أو رفضه.
 *  الإقرار هو ما يصرف فعلاً — فله صلاحيته المستقلة عن تسجيل المنصرف. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "req_approve", "إقرار طلبات صرف الحفلات");

    const { id } = await params;
    const action = str(body.action, "الإجراء");

    if (action === "approve") {
      return approveDispenseRequest(caller.db, id, caller.uid, str(body.departmentName, "القسم"));
    }
    if (action === "reject") {
      await rejectDispenseRequest(caller.db, id, caller.uid, optStr(body.reason, 300) ?? "");
      return { ok: true };
    }
    throw new ApiError("إجراء غير معروف");
  });
}
