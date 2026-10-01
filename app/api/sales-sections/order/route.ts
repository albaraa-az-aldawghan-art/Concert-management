import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str } from "@/lib/server/guard";
import { svcSetSalesSectionOrder } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "food", "reorder", "ترتيب أقسام البيع");
    const channel = str(body.channel, "قناة البيع");
    const sectionIds = (Array.isArray(body.sectionIds) ? body.sectionIds : [])
      .map((id: unknown) => str(id, "القسم"));
    await svcSetSalesSectionOrder(caller.db, channel, sectionIds);
  });
}
