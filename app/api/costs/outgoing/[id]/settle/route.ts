/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, num, str, optStr, dateStr } from "@/lib/server/guard";
import { svcSettleOutgoing } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "out_add", "تسوية المرتجع والتالف");
    const { id } = await params;
    const damaged = num(body.damagedQty ?? 0, "الكمية التالفة", { min: 0 });
    await svcSettleOutgoing(caller.db, id, {
      returnedQty: num(body.returnedQty ?? 0, "الكمية المرتجعة", { min: 0 }),
      damagedQty: damaged,
      reason: damaged > 0 ? str(body.reason, "سبب التلف") : (optStr(body.reason) ?? ""),
      damageDate: dateStr(body.damageDate, "التاريخ"),
      createdBy: caller.uid,
    });
  });
}
