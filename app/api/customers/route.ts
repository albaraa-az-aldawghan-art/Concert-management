import { NextRequest } from "next/server";
import { handle, optStr, require_, requireCaller, requirePage, str } from "@/lib/server/guard";
import { listConcertCustomers, updateConcertCustomer } from "@/lib/server/concert-customers-core";
import { customerAccess, visibleCustomerRecords } from "@/lib/customer-permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requirePage(caller, "customers", "عرض عملاء الحفلات");
    return visibleCustomerRecords(await listConcertCustomers(caller.db), customerAccess(caller.feat));
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    requirePage(caller, "customers", "عرض العملاء");
    require_(caller, "customers", "edit", "تعديل عملاء الحفلات");
    return updateConcertCustomer(caller.db, str(body.id, "معرّف العميل", { max: 100 }), {
      name: str(body.name, "اسم العميل", { max: 120 }),
      primaryPhone: str(body.primaryPhone, "الجوال الأساسي", { max: 20 }),
      secondaryPhone: optStr(body.secondaryPhone, 20),
      source: optStr(body.source, 80),
      referralName: optStr(body.referralName, 120),
      notes: optStr(body.notes, 1000),
    }, caller.uid);
  });
}

