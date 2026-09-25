/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr } from "@/lib/server/guard";
import { svcAddIncoming, svcAddIncomingInvoice } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "in_add", "تسجيل الوارد");
    if (Array.isArray(body.lines)) {
      return svcAddIncomingInvoice(caller.db, {
        supplierName: str(body.supplierName, "المورد"),
        invoiceNumber: optStr(body.invoiceNumber) ?? "",
        invoiceDate: dateStr(body.invoiceDate, "تاريخ الفاتورة"),
        createdBy: caller.uid,
        lines: body.lines.map((line: Record<string, unknown>) => ({
          itemBarcode: str(line.itemBarcode, "الصنف"),
          quantity: num(line.quantity, "الكمية", { positive: true }),
          priceBeforeVat: num(line.priceBeforeVat ?? 0, "السعر", { min: 0 }),
          dispenseUnit: optStr(line.dispenseUnit) ?? undefined,
        })),
      });
    }
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
