/* تعديل بكج أو حذفه. */

import { NextRequest } from "next/server";
import { requireCaller, handle, str, optStr, num, ApiError } from "@/lib/server/guard";
import { svcUpdatePackage, svcDeletePackage } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

function assertCanManage(caller: { isAdmin: boolean; feat: (p: never, f: string) => boolean }) {
  const allowed = caller.isAdmin || caller.feat("concerts" as never, "packages");
  if (!allowed) throw new ApiError("لا تملك صلاحية إدارة البكجات", 403);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    assertCanManage(caller);
    const { id } = await params;
    const items = Array.isArray(body.items) ? body.items : [];
    const materials = Array.isArray(body.materials) ? body.materials : [];
    await svcUpdatePackage(caller.db, id, {
      name: str(body.name, "اسم البكج", { max: 80 }),
      notes: optStr(body.notes, 300),
      items: items.map((i: { barcode: unknown; quantity: unknown }) => ({
        barcode: str(i.barcode, "الصنف"),
        quantity: num(i.quantity, "الكمية", { positive: true }),
      })),
      materials: materials.map((m: { itemId: unknown; count: unknown }) => ({
        itemId: str(m.itemId, "المادة"),
        count: num(m.count, "العدد", { positive: true }),
      })),
      createdBy: caller.uid,
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    assertCanManage(caller);
    const { id } = await params;
    await svcDeletePackage(caller.db, id);
  });
}
