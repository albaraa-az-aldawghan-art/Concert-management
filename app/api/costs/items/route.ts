import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, dateStr } from "@/lib/server/guard";
import { svcCreateItem } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "manage_items", "إدارة أصناف التكاليف");
    return svcCreateItem(caller.db, {
      name: str(body.name, "اسم الصنف"),
      unit: str(body.unit, "الوحدة"),
      mode: body.mode === "supplier" ? "supplier" : "generate",
      barcode: optStr(body.barcode) ?? undefined,
      productionDate: body.productionDate ? dateStr(body.productionDate, "تاريخ الإنتاج") : null,
      expiryDate: body.expiryDate ? dateStr(body.expiryDate, "تاريخ الانتهاء") : null,
      createdBy: caller.uid,
    });
  });
}
