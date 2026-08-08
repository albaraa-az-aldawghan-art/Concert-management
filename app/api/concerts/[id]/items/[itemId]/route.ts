import { NextRequest } from "next/server";
import { requireCaller, require_, handle, num, ApiError } from "@/lib/server/guard";
import {
  svcUpdateConcertItemCount, svcUpdateConcertItem, svcDeleteConcertItem, svcRecalcItemCosts,
} from "@/lib/server/stock-core";
import type { Firestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/** الحفلة تُقرأ من المادة نفسها حين لا يعرفها المسار: بعض النداءات
 *  تملك معرّف المادة وحده (تأكيد تسليم مادة مثلاً) فتمرّر "_" — والمادة
 *  تعرف حفلتها، فلا تُحدَّث تكاليف حفلة وهمية اسمها "_". */
async function concertIdOf(db: Firestore, itemId: string, fromPath: string): Promise<string> {
  if (fromPath && fromPath !== "_") return fromPath;
  const snap = await db.collection("concert_items").doc(itemId).get();
  if (!snap.exists) throw new ApiError("المادة غير موجودة", 404);
  return snap.data()!.concertId as string;
}

/** تعديل مادة: الكمية تحرّك الحجز بالفرق، والباقي تحديث مباشر */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "mat_edit_qty", "تعديل كميات المواد");
    const { id, itemId } = await params;
    const concertId = await concertIdOf(caller.db, itemId, id);

    if (body.count !== undefined) {
      await svcUpdateConcertItemCount(caller.db, itemId, num(body.count, "الكمية", { positive: true }));
    }
    await svcUpdateConcertItem(caller.db, itemId, {
      unitCost: body.unitCost,
      totalCost: body.totalCost,
      assignedToEmployeeId: body.assignedToEmployeeId,
      assignedToEmployeeName: body.assignedToEmployeeName,
      deliveryStatus: body.deliveryStatus,
      returnStatus: body.returnStatus,
    });
    // الحقلان المشتقّان (تكلفة الخارجية وقيمة الداخلية) يُعادان بعد كل تغيير
    await svcRecalcItemCosts(caller.db, concertId);
  });
}

/** حذف مادة — يُفرج عمّا حجزته ثم تُعاد التكاليف المشتقّة */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "mat_delete", "حذف مواد الحفلة");
    const { id, itemId } = await params;
    const concertId = await concertIdOf(caller.db, itemId, id);
    await svcDeleteConcertItem(caller.db, itemId);
    await svcRecalcItemCosts(caller.db, concertId);
  });
}
