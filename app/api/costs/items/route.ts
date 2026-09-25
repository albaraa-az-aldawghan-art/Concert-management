/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, dateStr, ApiError } from "@/lib/server/guard";
import { svcCreateItem } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "item_add", "إدارة أصناف التكاليف");
    if (body.salesSectionIds !== undefined && !Array.isArray(body.salesSectionIds)) {
      throw new ApiError("قائمة أقسام البيع غير صالحة");
    }
    return svcCreateItem(caller.db, {
      name: str(body.name, "اسم الصنف"),
      unit: str(body.unit, "الوحدة"),
      mode: body.mode === "supplier" ? "supplier" : "generate",
      barcode: optStr(body.barcode) ?? undefined,
      productionDate: body.productionDate ? dateStr(body.productionDate, "تاريخ الإنتاج") : null,
      expiryDate: body.expiryDate ? dateStr(body.expiryDate, "تاريخ الانتهاء") : null,
      createdBy: caller.uid,
      salesSectionIds: body.salesSectionIds?.map((id: unknown) => str(id, "قسم البيع")),
      kind: body.kind === "raw" || body.kind === "produced" || body.kind === "sale" ? body.kind : undefined,
      rawCategory: body.rawCategory ? str(body.rawCategory, "قسم المادة الخام", { max: 100 }) : null,
    });
  });
}
