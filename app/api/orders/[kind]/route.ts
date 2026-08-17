/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, str, optStr } from "@/lib/server/guard";
import { svcSendOrder, svcConfirmOrder } from "@/lib/server/kitchen-core";

export const dynamic = "force-dynamic";

/** إرسال طلب للمطبخ أو للموارد، أو تأكيد استلامه.
 *  الإرسال والتأكيد صلاحيتان منفصلتان لكل جهة — لا يفتح إرسال المطبخ
 *  الباب لإرسال الموارد ولا العكس. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const { kind } = await params;
    if (kind !== "kitchen" && kind !== "warehouse") throw new ApiError("نوع طلب غير معروف");

    const action = str(body.action, "الإجراء");

    if (action === "send") {
      if (kind === "kitchen") require_(caller, "concerts", "send_kitchen", "إرسال طلبات المطبخ");
      else require_(caller, "concerts", "send_warehouse", "إرسال طلبات الموارد");
      await svcSendOrder(caller.db, kind, str(body.concertId, "الحفلة"), caller.uid, optStr(body.note, 500));
      return { ok: true };
    }

    if (action === "confirm") {
      if (kind === "kitchen") require_(caller, "kitchen", "confirm", "تأكيد استلام المطبخ");
      else require_(caller, "warehouse_orders", "confirm", "تأكيد استلام الموارد");
      await svcConfirmOrder(caller.db, kind, str(body.orderId, "الطلب"), caller.uid);
      return { ok: true };
    }

    throw new ApiError("إجراء غير معروف");
  });
}
