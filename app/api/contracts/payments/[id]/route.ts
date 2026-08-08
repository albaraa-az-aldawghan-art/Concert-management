/* حذف دفعة عقد — يعيد حساب المدفوع بعده. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcDeleteContractPayment } from "@/lib/server/contracts-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "pay_add", "حذف دفعات العقود");
    const { id } = await params;
    await svcDeleteContractPayment(caller.db, id);
  });
}
