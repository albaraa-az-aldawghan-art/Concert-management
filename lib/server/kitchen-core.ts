/* طلبات المطبخ والموارد.
   ═══════════════════════════════════════════════════════════════
   كانتا آخر مجموعتين تُكتبان من المتصفح مباشرة، واسم من أكّد الاستلام
   يصل نصاً من العميل — فيمكن أن يُنسب التأكيد إلى غير صاحبه. صارتا
   هنا: الهوية من الرمز لا من الجسم، والسطور تُقرأ من أصناف الحفلة
   لحظة الإرسال فلا يُرسل العميل ما يشاء.
   ═══════════════════════════════════════════════════════════════ */

import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";

type Kind = "kitchen" | "warehouse";
const COL: Record<Kind, string> = { kitchen: "kitchen_orders", warehouse: "warehouse_orders" };

/** لقطة من الحفلة وأصناف أكلها وقت الإرسال — الطبّاخ يرى ما يُعدّه */
async function snapshot(db: Firestore, concertId: string) {
  const cSnap = await db.collection("concerts").doc(concertId).get();
  if (!cSnap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  const c = cSnap.data()!;

  const foodSnap = await db.collection("concert_food").where("concertId", "==", concertId).get();
  const lines = foodSnap.docs.map((d) => {
    const f = d.data();
    return {
      name: (f.selectedOption as string) ?? "",
      categoryName: (f.categoryName as string) ?? "",
      quantity: (f.quantity as number) ?? null,
      notes: (f.notes as string) ?? null,
    };
  });

  return {
    concertId,
    concertNumber: c.concertNumber ?? 0,
    clientName: c.clientName ?? "",
    concertDate: c.date ?? null,
    venueName: c.venueName ?? null,
    peopleCount: c.peopleCount ?? null,
    lines,
  };
}

/** الإرسال: مستند واحد لكل حفلة، فإعادة الإرسال تُحدّثه ولا تُكرّره */
export async function svcSendOrder(db: Firestore, kind: Kind, concertId: string, uid: string) {
  const snap = await snapshot(db, concertId);
  await db.collection(COL[kind]).doc(concertId).set({
    ...snap,
    status: "sent",
    sentAt: Timestamp.now(),
    sentBy: uid,
    receivedAt: null,
    receivedBy: null,
  });
}

/** التأكيد: المؤكِّد يُؤخذ من الرمز لا مما يرسله المتصفح */
export async function svcConfirmOrder(db: Firestore, kind: Kind, orderId: string, uid: string) {
  const ref = db.collection(COL[kind]).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الطلب غير موجود", 404);
  if (snap.data()?.status === "received") throw new ApiError("الطلب مؤكَّد أصلاً");
  await ref.update({ status: "received", receivedAt: Timestamp.now(), receivedBy: uid });
}
