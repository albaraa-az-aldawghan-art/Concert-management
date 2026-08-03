import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr } from "@/lib/server/guard";
import { svcAddExpense } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** فاتورة مصروفات على حفلة — تُقبل على المؤكدة والمكتملة فقط،
 *  وتكاليف الحفلة تُعاد كتابتها من الفواتير بعدها */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "payments", "تسجيل المصروفات");
    return svcAddExpense(caller.db, {
      concertId: str(body.concertId, "الحفلة"),
      type: str(body.type, "نوع المصروف"),
      description: optStr(body.description, 500),
      amount: num(body.amount, "المبلغ", { positive: true }),
      vatIncluded: !!body.vatIncluded,
      invoiceDate: dateStr(body.invoiceDate, "تاريخ الفاتورة"),
      supplierName: optStr(body.supplierName),
      createdBy: caller.uid,
    });
  });
}
