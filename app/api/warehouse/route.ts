import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, num, optStr, ApiError } from "@/lib/server/guard";
import { svcAddWarehouseItem, svcReorderWarehouse } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** إضافة مادة للموارد — المتاح يبدأ مساوياً للإجمالي */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "warehouse", "add", "إضافة مواد الموارد");
    return svcAddWarehouseItem(caller.db, {
      name: str(body.name, "اسم المادة"),
      totalCount: num(body.totalCount, "العدد", { min: 0 }),
      type: body.type === "internal" ? "internal" : "external",
      pricePerUnit: body.pricePerUnit != null ? num(body.pricePerUnit, "السعر", { min: 0 }) : null,
      imageUrl: optStr(body.imageUrl, 500),
    });
  });
}

/** إعادة ترتيب البطاقات */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "warehouse", "edit", "إعادة ترتيب الموارد");
    if (!Array.isArray(body.orderedIds)) throw new ApiError("قائمة الترتيب مطلوبة");
    await svcReorderWarehouse(caller.db, body.orderedIds);
  });
}
