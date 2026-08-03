/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, requireAdmin, handle } from "@/lib/server/guard";
import { svcDeleteProduction } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requireAdmin(caller, "حذف عمليات الإنتاج");
    const { id } = await params;
    await svcDeleteProduction(caller.db, id);
  });
}
