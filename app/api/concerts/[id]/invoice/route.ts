/* فاتورة الحفلة — واحدة للحفلة كلها لا لكل دفعة. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, optStr } from "@/lib/server/guard";
import { svcSetConcertInvoice } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "pay_invoice", "تسجيل رقم الفاتورة");
    const { id } = await params;
    await svcSetConcertInvoice(caller.db, id, {
      hasInvoice: body.hasInvoice === true ? true : body.hasInvoice === false ? false : null,
      invoiceNumber: optStr(body.invoiceNumber, 60),
      uid: caller.uid,
    });
  });
}
