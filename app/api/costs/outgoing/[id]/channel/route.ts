/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, optStr } from "@/lib/server/guard";
import { assertChannel } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

/** إعادة إسناد عملية منصرف إلى وجهتها.
 *  يمسّ تكلفة حفلة أو عقد أو شهر مطعم، فله صلاحيته المستقلة عن التسجيل،
 *  ويعيد التحقّق بنفس قواعد التسجيل — لا يُصدَّق ما يرسله العميل. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "out_reassign", "إعادة إسناد المنصرف");

    const { id } = await params;
    const ref = caller.db.collection("cost_outgoing").doc(id);
    if (!(await ref.get()).exists) throw new ApiError("العملية غير موجودة", 404);

    const concertId = optStr(body.concertId);
    const contractId = optStr(body.contractId);
    const manualConcertName = optStr(body.manualConcertName);

    const channel = await assertChannel(caller.db, optStr(body.channel), {
      concertId, manualConcertName, contractId,
    });

    /* تُفرَّغ حقول الجهات التي لا تخصّ القناة الجديدة، وإلا بقيت
       العملية محسوبة على حفلتها القديمة رغم نقلها */
    await ref.update({
      channel,
      concertId:  channel === "concerts" ? concertId : null,
      concertName: channel === "concerts" ? optStr(body.concertName) : null,
      clientName:  channel === "concerts" ? optStr(body.clientName) : null,
      manualConcertName: channel === "concerts" ? manualConcertName : null,
      contractId:   channel === "contracts" ? contractId : null,
      contractName: channel === "contracts" ? optStr(body.contractName) : null,
    });

    return { ok: true };
  });
}
