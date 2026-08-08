/* دفعات العقود — بنفس قواعد دفعات الحفلات ورقم الفاتورة الفريد. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr, ApiError } from "@/lib/server/guard";
import { svcAddContractPayment } from "@/lib/server/contracts-core";

export const dynamic = "force-dynamic";

const METHODS = ["card", "cash", "bank_transfer"];

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "pay_add", "تسجيل دفعات العقود");
    if (!METHODS.includes(body.method)) throw new ApiError("وسيلة دفع غير معروفة");

    const invoiceNumber = optStr(body.invoiceNumber, 60);
    const hasInvoice = body.method === "card" ? true : (body.hasInvoice ?? null);
    return svcAddContractPayment(caller.db, {
      contractId: str(body.contractId, "العقد"),
      method: body.method,
      amount: num(body.amount, "المبلغ", { positive: true }),
      date: dateStr(body.date, "التاريخ"),
      cardType: body.method === "card" ? (body.cardType === "mada" ? "mada" : "visa") : null,
      receiverName: body.method === "cash" ? optStr(body.receiverName) : null,
      bankName: body.method === "bank_transfer" ? optStr(body.bankName) : null,
      senderName: body.method === "bank_transfer" ? optStr(body.senderName) : null,
      hasInvoice,
      invoiceRegistered: hasInvoice ? !!invoiceNumber : null,
      invoiceNumber: hasInvoice ? invoiceNumber : null,
      createdBy: caller.uid,
    });
  });
}
