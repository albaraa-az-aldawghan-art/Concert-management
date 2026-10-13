/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, requirePage, require_, handle } from "@/lib/server/guard";
import { svcDeleteIncoming } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requirePage(caller, "costs", "الوصول إلى المشتريات والوارد");
    require_(caller, "costs", "in_delete", "حذف عمليات الوارد");
    const { id } = await params;
    await svcDeleteIncoming(caller.db, id);
  });
}
