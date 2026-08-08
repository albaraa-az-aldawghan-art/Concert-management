import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, num, optStr } from "@/lib/server/guard";
import { svcAddConcertItem, svcRecalcItemCosts } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** إضافة مادة للحفلة — تُحجز من المتوفر في نفس المعاملة */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "mat_add", "إضافة مواد للحفلة");
    const { id } = await params;

    const res = await svcAddConcertItem(caller.db, {
      concertId: id,
      itemId: str(body.itemId, "المادة"),
      itemName: str(body.itemName, "اسم المادة"),
      type: body.type === "internal" ? "internal" : "external",
      count: num(body.count, "الكمية", { positive: true }),
      unitCost: body.unitCost != null ? num(body.unitCost, "سعر الوحدة", { min: 0 }) : null,
      totalCost: body.totalCost != null ? num(body.totalCost, "الإجمالي", { min: 0 }) : null,
      assignedToEmployeeId: optStr(body.assignedToEmployeeId),
      assignedToEmployeeName: optStr(body.assignedToEmployeeName),
    });
    await svcRecalcItemCosts(caller.db, id); // الحقلان المشتقّان يُحدَّثان فوراً
    return res;
  });
}
