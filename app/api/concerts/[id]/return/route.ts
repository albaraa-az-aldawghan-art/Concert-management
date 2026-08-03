import { NextRequest } from "next/server";
import { requireCaller, handle, ApiError } from "@/lib/server/guard";
import { svcConfirmWarehouseReturn } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** تأكيد استلام الموارد للمواد الراجعة — يعيد المحجوز ما عدا المفقود */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    const allowed =
      caller.isAdmin ||
      caller.role === "warehouse_manager" ||
      caller.feat("warehouse_orders", "confirm_return");
    if (!allowed) throw new ApiError("تأكيد الاستلام لمسؤول الموارد", 403);
    const { id } = await params;
    await svcConfirmWarehouseReturn(caller.db, id, caller.uid);
  });
}
