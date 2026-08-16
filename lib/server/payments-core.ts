import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { syncDispenseRequest } from "@/lib/server/dispense-requests-core";

/* دفعات الحفلات على الخادم: المدفوع مشتقّ من مجموع الدفعات لا من رقم
   يرسله العميل. والفاتورة لم تعد هنا — صارت على الحفلة نفسها، فاتورة
   واحدة للعمل كله لا لكل دفعة (svcSetConcertInvoice). */

interface PaymentInput {
  concertId: string;
  method: "card" | "cash" | "bank_transfer";
  amount: number;
  date: string;
  cardType: "visa" | "mada" | null;
  receiverName: string | null;
  bankName: string | null;
  senderName: string | null;
  createdBy: string;
}

async function recalcDeposit(db: Firestore, concertId: string, alsoConfirm: boolean) {
  const [pays, concert] = await Promise.all([
    db.collection("concert_payments").where("concertId", "==", concertId).get(),
    db.collection("concerts").doc(concertId).get(),
  ]);
  const total = pays.docs.reduce((s, d) => s + ((d.data().amount as number) ?? 0), 0);
  const update: Record<string, unknown> = { deposit: total };
  /* أول دفعة تؤكّد الحفلة، والتأكيد هو ما يُنشئ طلب الصرف */
  const nowConfirmed = alsoConfirm && concert.data()?.status === "planned";
  if (nowConfirmed) update.status = "confirmed";
  await db.collection("concerts").doc(concertId).update(update);

  /* التأكيد هو ما يُنشئ طلب الصرف ويُخبر المطبخ والموارد. كان هذا
     السطر ناقصاً فلم يقع الطلب إلا إذا عُدِّلت أصناف الأكل بعد التأكيد. */
  if (nowConfirmed) await syncDispenseRequest(db, concertId, "system");
}

export async function svcAddPayment(db: Firestore, d: PaymentInput, opts: { confirmConcert: boolean }) {
  const concert = await db.collection("concerts").doc(d.concertId).get();
  if (!concert.exists) throw new ApiError("الحفلة غير موجودة", 404);
  if (concert.data()?.status === "cancelled") throw new ApiError("الحفلة ملغاة — لا تُسجَّل عليها دفعات");

  /* المحصَّل لا يتجاوز السعر: خطأ رقم واحد يقلب المتبقي إلى سالب ضخم
     ويشوّه القائمة المالية كلها. إن كان السعر تغيّر فليُحدَّث أولاً. */
  const price = (concert.data()?.price as number) ?? 0;
  if (price > 0) {
    const paid = (await db.collection("concert_payments").where("concertId", "==", d.concertId).get())
      .docs.reduce((s, x) => s + ((x.data().amount as number) ?? 0), 0);
    const remaining = Math.round((price - paid) * 100) / 100;
    if (d.amount > remaining + 0.01) {
      throw new ApiError(
        `المبلغ أكبر من المتبقي على الحفلة (${remaining} ريال). عدّل سعر الحفلة أولاً إن تغيّر.`
      );
    }
  }

  const ref = db.collection("concert_payments").doc();
  await ref.set({ ...d, createdAt: Timestamp.now() });
  await recalcDeposit(db, d.concertId, opts.confirmConcert);
  return { id: ref.id };
}

export async function svcDeletePayment(db: Firestore, paymentId: string) {
  const ref = db.collection("concert_payments").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الدفعة غير موجودة", 404);
  const concertId = snap.data()!.concertId as string;
  await ref.delete();
  await recalcDeposit(db, concertId, false);
}
