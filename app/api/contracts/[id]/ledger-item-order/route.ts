/* ترتيب عرض بنود العقد في الجدول اليومي — يُسجَّله من يُدخل اليوم لا من يُعدّ الجدول. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str } from "@/lib/server/guard";
import { svcSetLedgerItemOrder } from "@/lib/server/contract-ledger-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "ledger_edit", "ترتيب الجدول اليومي");
    const { id } = await params;

    const itemOrder = (Array.isArray(body.itemOrder) ? body.itemOrder : []).map((b: unknown) => str(b, "الصنف"));
    await svcSetLedgerItemOrder(caller.db, id, itemOrder);
  });
}
