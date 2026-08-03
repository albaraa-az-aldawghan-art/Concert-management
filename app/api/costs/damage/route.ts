import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, num, dateStr } from "@/lib/server/guard";
import { svcAddStoreDamage } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "record_outgoing", "تسجيل التالف");
    return svcAddStoreDamage(caller.db, {
      itemBarcode: str(body.itemBarcode, "الصنف"),
      quantity: num(body.quantity, "الكمية", { positive: true }),
      reason: str(body.reason, "سبب التلف"),
      damageDate: dateStr(body.damageDate, "تاريخ التلف"),
      createdBy: caller.uid,
    });
  });
}
