/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات.
   لا PATCH هنا: الفاتورة انتقلت إلى الحفلة (‏PATCH /api/concerts/[id]/invoice)،
   فلم يبقَ في الدفعة حقلٌ يُعدَّل بعد إنشائها — والمبلغ يُغيَّر بالحذف
   وإعادة التسجيل كي يُعاد اشتقاق المحصَّل. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcDeletePayment } from "@/lib/server/payments-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "pay_delete", "حذف الدفعات");
    const { id } = await params;
    await svcDeletePayment(caller.db, id);
  });
}
