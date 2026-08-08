/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, optStr } from "@/lib/server/guard";
import { svcUpdatePaymentInvoice, svcDeletePayment } from "@/lib/server/payments-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "pay_invoice", "تسجيل رقم الفاتورة");
    const { id } = await params;
    const invoiceNumber = optStr(body.invoiceNumber, 60);
    const hasInvoice = body.hasInvoice ?? null;
    await svcUpdatePaymentInvoice(caller.db, id, {
      hasInvoice,
      invoiceRegistered: hasInvoice ? !!invoiceNumber : null,
      invoiceNumber: hasInvoice ? invoiceNumber : null,
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "pay_delete", "حذف الدفعات");
    const { id } = await params;
    await svcDeletePayment(caller.db, id);
  });
}
