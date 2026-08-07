/* تعديل قسم بيع أو حذفه — الحذف ينزع القسم من كل صنف يشير إليه. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, num } from "@/lib/server/guard";
import { svcUpdateSection, svcDeleteSection } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "manage_items", "تعديل أقسام البيع");
    const { id } = await params;
    await svcUpdateSection(caller.db, id, {
      name: body.name !== undefined ? str(body.name, "اسم القسم", { max: 60 }) : undefined,
      order: body.order !== undefined ? num(body.order, "الترتيب", { min: 0 }) : undefined,
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "costs", "manage_items", "حذف أقسام البيع");
    const { id } = await params;
    return svcDeleteSection(caller.db, id);
  });
}
