/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr } from "@/lib/server/guard";
import { svcAddIncoming } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "record_incoming", "تسجيل الوارد");
    return svcAddIncoming(caller.db, {
      itemBarcode: str(body.itemBarcode, "الصنف"),
      supplierName: optStr(body.supplierName) ?? "",
      quantity: num(body.quantity, "الكمية", { positive: true }),
      priceBeforeVat: num(body.priceBeforeVat ?? 0, "السعر", { min: 0 }),
      invoiceDate: dateStr(body.invoiceDate, "تاريخ الفاتورة"),
      createdBy: caller.uid,
    });
  });
}
