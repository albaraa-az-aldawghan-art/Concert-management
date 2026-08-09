import { NextRequest } from "next/server";
import { requireCaller, handle, ApiError } from "@/lib/server/guard";
import { svcConfirmWarehouseReturn, svcUndoWarehouseReturn } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** تأكيد استلام الموارد للمواد الراجعة — يعيد المحجوز ما عدا المفقود */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    /* لا استثناء بالاسم: دور مدير الموارد مستند تُعدَّل صلاحياته، ونزع
       «تأكيد استلام المرتجع» منه يجب أن يمنعه فعلاً */
    if (!caller.feat("warehouse_orders", "confirm_return") && !caller.feat("concerts", "wf_run")) {
      throw new ApiError("لا تملك صلاحية تأكيد استلام المرتجع", 403);
    }
    const { id } = await params;
    await svcConfirmWarehouseReturn(caller.db, id, caller.uid);
  });
}

/** التراجع عن التأكيد — يُعيد حجز ما أُفرج عنه، أو يرفض إن لم يبقَ متوفراً */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    if (!caller.feat("concerts", "wf_undo")) {
      throw new ApiError("لا تملك صلاحية التراجع عن خطوات الحفلة", 403);
    }
    const { id } = await params;
    await svcUndoWarehouseReturn(caller.db, id, caller.uid);
  });
}
