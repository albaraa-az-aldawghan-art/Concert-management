import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";

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
}

export async function svcAddPayment(db: Firestore, d: PaymentInput, opts: { confirmConcert: boolean }) {
  const concert = await db.collection("concerts").doc(d.concertId).get();
  if (!concert.exists) throw new ApiError("الحفلة غير موجودة", 404);
  await assertInvoiceFree(db, d.invoiceNumber);

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
