/* البكجات: مجموعة أصناف ومواد تُضاف للحفلة بضغطة واحدة. */

import { NextRequest } from "next/server";
import { requireCaller, handle, str, optStr, num, ApiError } from "@/lib/server/guard";
import { svcCreatePackage } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

/** البكج يضبطه المدير أو مشرف الحفلات المخوَّل — لا من يفتح الصفحة فقط */
function assertCanManage(caller: { isAdmin: boolean; feat: (p: never, f: string) => boolean }) {
  const allowed = caller.isAdmin || caller.feat("concerts" as never, "packages");
  if (!allowed) throw new ApiError("لا تملك صلاحية إدارة البكجات", 403);
}

function parseBody(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : [];
  const materials = Array.isArray(body.materials) ? body.materials : [];
  return {
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
  };
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    assertCanManage(caller);
    return svcCreatePackage(caller.db, { ...parseBody(body), createdBy: caller.uid });
  });
}
