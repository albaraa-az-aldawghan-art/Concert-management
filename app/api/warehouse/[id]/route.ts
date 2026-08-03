import { NextRequest } from "next/server";
import { requireCaller, require_, handle, num } from "@/lib/server/guard";
import { svcUpdateWarehouseItem, svcDeleteWarehouseItem } from "@/lib/server/stock-core";

export const dynamic = "force-dynamic";

/** تعديل مادة — تغيير الإجمالي يحرّك المتاح بنفس الفرق ولا يمسّ المحجوز */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "warehouse", "edit", "تعديل مواد الموارد");
    const { id } = await params;
    await svcUpdateWarehouseItem(caller.db, id, {
      name: body.name,
      totalCount: body.totalCount != null ? num(body.totalCount, "العدد", { min: 0 }) : undefined,
      type: body.type,
      pricePerUnit: body.pricePerUnit,
      imageUrl: body.imageUrl,
      order: body.order,
    });
  });
}

/** حذف مادة — يُمنع إن كانت مستعملة في حفلة */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "warehouse", "delete", "حذف مواد الموارد");
    const { id } = await params;
    await svcDeleteWarehouseItem(caller.db, id);
  });
}
