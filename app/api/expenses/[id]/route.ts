import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcDeleteExpense } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** حذف فاتورة — تُعاد كتابة تكاليف الحفلة بعده */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "exp_delete", "حذف فواتير المصروفات");
    const { id } = await params;
    await svcDeleteExpense(caller.db, id);
  });
}
