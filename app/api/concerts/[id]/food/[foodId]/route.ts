import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcUpdateConcertFood, svcDeleteConcertFood } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** تعديل كمية صنف الأكل أو ملاحظته */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ foodId: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "food_edit_qty", "تعديل كميات الأكل");
    const { foodId } = await params;
    await svcUpdateConcertFood(caller.db, foodId, {
      quantity: body.quantity != null ? Number(body.quantity) : body.quantity,
      notes: body.notes,
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ foodId: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "food_delete", "حذف أصناف الأكل");
    const { foodId } = await params;
    await svcDeleteConcertFood(caller.db, foodId);
  });
}
