import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { syncDispenseRequest } from "@/lib/server/dispense-requests-core";

/* دفعات الحفلات على الخادم: المدفوع مشتقّ من مجموع الدفعات لا من رقم
   يرسله العميل، ورقم الفاتورة يُفحص تكراره قبل أي كتابة. */

interface PaymentInput {
  concertId: string;
  method: "card" | "cash" | "bank_transfer";
  amount: number;
  date: string;
  cardType: "visa" | "mada" | null;
  receiverName: string | null;
  bankName: string | null;
  senderName: string | null;
  hasInvoice: boolean | null;
  invoiceRegistered: boolean | null;
  invoiceNumber: string | null;
  createdBy: string;
}

async function assertInvoiceFree(db: Firestore, num: string | null, excludeId?: string) {
  if (!num) return;
  const snap = await db.collection("concert_payments").where("invoiceNumber", "==", num).get();
  const clash = snap.docs.find((d) => d.id !== excludeId);
  if (clash) {
    const c = clash.data() as { amount: number; date?: string };
    throw new ApiError(
      `رقم الفاتورة ${num} مستخدم في دفعة أخرى (${(c.amount ?? 0).toLocaleString("en-US")} ريال${c.date ? ` بتاريخ ${c.date}` : ""})`
    );
  }
}

/** يعيد حساب المدفوع من الدفعات — نفس أسلوب اشتقاق تكاليف المصروفات */
async function recalcDeposit(db: Firestore, concertId: string, alsoConfirm: boolean) {
  const [pays, concert] = await Promise.all([
    db.collection("concert_payments").where("concertId", "==", concertId).get(),
    db.collection("concerts").doc(concertId).get(),
  ]);
  const total = pays.docs.reduce((s, d) => s + ((d.data().amount as number) ?? 0), 0);
  const update: Record<string, unknown> = { deposit: total };
  // أول دفعة تؤكّد الحفلة — تبقى القاعدة كما كانت في العميل
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
  await assertInvoiceFree(db, d.invoiceNumber);

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

export async function svcUpdatePaymentInvoice(
  db: Firestore,
  paymentId: string,
  d: { hasInvoice: boolean | null; invoiceRegistered: boolean | null; invoiceNumber: string | null }
) {
  const ref = db.collection("concert_payments").doc(paymentId);
  if (!(await ref.get()).exists) throw new ApiError("الدفعة غير موجودة", 404);
  await assertInvoiceFree(db, d.invoiceNumber, paymentId);
  await ref.update({ ...d });
}

export async function svcDeletePayment(db: Firestore, paymentId: string) {
  const ref = db.collection("concert_payments").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الدفعة غير موجودة", 404);
  const concertId = snap.data()!.concertId as string;
  await ref.delete();
  await recalcDeposit(db, concertId, false);
}
