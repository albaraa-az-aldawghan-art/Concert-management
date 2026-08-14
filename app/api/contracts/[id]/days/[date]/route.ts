/* حذف يوم من الجدول — يُرجع كل ما صُرف فيه للمخزون قبل محوه. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, dateStr } from "@/lib/server/guard";
import { svcDeleteContractDay } from "@/lib/server/contract-ledger-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; date: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "ledger_delete", "حذف يوم من الجدول");
    const { id, date } = await params;
    await svcDeleteContractDay(caller.db, id, dateStr(date, "تاريخ اليوم"), caller.uid);
  });
}
