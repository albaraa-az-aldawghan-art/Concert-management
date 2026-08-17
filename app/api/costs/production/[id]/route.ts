/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr, ApiError } from "@/lib/server/guard";
import { svcUpdateProduction, svcDeleteProduction } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "prod_edit", "تعديل عمليات الإنتاج");
    if (!Array.isArray(body.inputs)) throw new ApiError("المدخلات مطلوبة");
    const { id } = await params;
    await svcUpdateProduction(caller.db, id, {
      outputQty: num(body.outputQty, "كمية الإنتاج", { positive: true }),
      inputs: body.inputs.map((i: { barcode: unknown; qty: unknown }) => ({
        barcode: str(i.barcode, "مادة خام"),
        qty: num(i.qty, "كمية المادة الخام", { positive: true }),
      })),
      productionDate: dateStr(body.productionDate, "تاريخ الإنتاج"),
      expiryDate: body.expiryDate ? dateStr(body.expiryDate, "تاريخ الانتهاء") : null,
      notes: optStr(body.notes, 500),
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    /* لا استثناء بالاسم: الكتالوج يعرّف prod_delete كصلاحية تُمنح
       لدور مخصص، وكانت هذه النقطة تتجاهله وتقفل الحذف على الأدمن وحده
       — فمن يُمنح الصلاحية يرى زرّ الحذف في الواجهة ثم يُفاجَأ بالرفض. */
    require_(caller, "costs", "prod_delete", "حذف عمليات الإنتاج");
    const { id } = await params;
    await svcDeleteProduction(caller.db, id);
  });
}
