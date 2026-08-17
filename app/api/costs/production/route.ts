/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr, ApiError } from "@/lib/server/guard";
import { svcAddProduction } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "prod_add", "تسجيل الإنتاج");
    if (!Array.isArray(body.inputs)) throw new ApiError("المدخلات مطلوبة");
    return svcAddProduction(caller.db, {
      outputBarcode: str(body.outputBarcode, "الصنف المُنتَج"),
      outputQty: num(body.outputQty, "كمية الإنتاج", { positive: true }),
      inputs: body.inputs.map((i: { barcode: unknown; qty: unknown }) => ({
        barcode: str(i.barcode, "مادة خام"),
        qty: num(i.qty, "كمية المادة الخام", { positive: true }),
      })),
      sectionIds: Array.isArray(body.sectionIds) ? body.sectionIds.map(String) : [],
      productionDate: dateStr(body.productionDate, "تاريخ الإنتاج"),
      expiryDate: body.expiryDate ? dateStr(body.expiryDate, "تاريخ الانتهاء") : null,
      notes: optStr(body.notes, 500),
      createdBy: caller.uid,
    });
  });
}
