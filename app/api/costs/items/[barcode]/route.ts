import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, dateStr } from "@/lib/server/guard";
import { svcUpdateItem, svcDeleteItem } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ barcode: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "manage_items", "تعديل أصناف التكاليف");
    const { barcode } = await params;
    await svcUpdateItem(caller.db, barcode, {
      name: body.name !== undefined ? str(body.name, "اسم الصنف") : undefined,
      unit: body.unit !== undefined ? str(body.unit, "الوحدة") : undefined,
      productionDate: body.productionDate !== undefined
        ? (body.productionDate ? dateStr(body.productionDate, "تاريخ الإنتاج") : null)
        : undefined,
      expiryDate: body.expiryDate !== undefined
        ? (body.expiryDate ? dateStr(body.expiryDate, "تاريخ الانتهاء") : null)
        : undefined,
      productionRecipe: body.productionRecipe,
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ barcode: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "costs", "manage_items", "حذف أصناف التكاليف");
    const { barcode } = await params;
    await svcDeleteItem(caller.db, barcode);
  });
}
