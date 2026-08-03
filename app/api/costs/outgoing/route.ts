import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr } from "@/lib/server/guard";
import { svcAddOutgoing } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "record_outgoing", "تسجيل المنصرف");
    return svcAddOutgoing(caller.db, {
      itemBarcode: str(body.itemBarcode, "الصنف"),
      quantity: num(body.quantity, "الكمية", { positive: true }),
      unitPrice: num(body.unitPrice ?? 0, "السعر", { min: 0 }),
      departmentName: str(body.departmentName, "القسم"),
      concertId: optStr(body.concertId),
      concertName: optStr(body.concertName),
      clientName: optStr(body.clientName),
      manualConcertName: optStr(body.manualConcertName),
      dispenseDate: dateStr(body.dispenseDate, "تاريخ الصرف"),
      createdBy: caller.uid,
    });
  });
}
