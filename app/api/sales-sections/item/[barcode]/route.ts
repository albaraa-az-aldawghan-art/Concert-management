/* تعيين أقسام البيع لصنف — تُستبدل القائمة كاملة بما أُرسل. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, ApiError } from "@/lib/server/guard";
import { svcSetItemSections } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ barcode: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "manage_items", "تحديد أقسام بيع الأصناف");
    if (!Array.isArray(body.sectionIds)) throw new ApiError("قائمة الأقسام مطلوبة");
    const { barcode } = await params;
    await svcSetItemSections(caller.db, decodeURIComponent(barcode), body.sectionIds.map(String));
  });
}
