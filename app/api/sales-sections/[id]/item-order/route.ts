/* ترتيب أصناف قسم بيع بالسحب والإفلات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str } from "@/lib/server/guard";
import { svcSetSectionItemOrder } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "item_add", "ترتيب أصناف القسم");
    const { id } = await params;
    const itemOrder = (Array.isArray(body.itemOrder) ? body.itemOrder : []).map((b: unknown) => str(b, "الصنف"));
    await svcSetSectionItemOrder(caller.db, id, itemOrder);
  });
}
