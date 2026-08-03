import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { svcReleaseConcertStock } from "@/lib/server/stock-core";

/* ═══════════════════════════════════════════════════════════════
   الحفلات وفواتير مصروفاتها على الخادم.

   رقم الحفلة يُولَّد من عدّاد داخل معاملة فلا يتكرّر رقمان مهما تزامن
   الطلبان. والحقول المشتقّة (تكلفة النقل والعمالة والأخرى) تُعاد كتابتها
   من الفواتير بعد كل تغيير، فلا يكتبها أحد يدوياً ثم تنحرف بصمت.
   ═══════════════════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** التاريخ يصل عبر JSON كـ{seconds,nanoseconds} أو نصاً — يُعاد إلى
 *  Timestamp حقيقي، وإلا خُزّن كخريطة فتعطّل كل فلاتر التاريخ والترتيب */
function toTimestamp(v: unknown): Timestamp | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v;
  if (typeof v === "object" && v !== null && "seconds" in v) {
    const o = v as { seconds: number; nanoseconds?: number };
    return new Timestamp(Number(o.seconds), Number(o.nanoseconds ?? 0));
  }
  if (typeof v === "string" || typeof v === "number") {
    const ms = typeof v === "number" ? v : Date.parse(v);
    if (!isNaN(ms)) return Timestamp.fromMillis(ms);
  }
  return null;
}

/* ── إنشاء وتعديل الحفلة ───────────────────────────────────── */

export async function svcCreateConcert(db: Firestore, d: Record<string, unknown>, uid: string) {
  const counterRef = db.collection("counters").doc("concerts");
  const concertRef = db.collection("concerts").doc();
  let concertNumber = 1;

  await db.runTransaction(async (tx) => {
    const cSnap = await tx.get(counterRef);
    concertNumber = ((cSnap.data()?.lastNumber as number) ?? 0) + 1;
    tx.set(counterRef, { lastNumber: concertNumber });

    const date = toTimestamp(d.date);
    if (!date) throw new ApiError("تاريخ الحفلة غير صحيح");

    tx.set(concertRef, {
      ...d,
      date,
      concertNumber,
      // كل حفلة تبدأ من الصفر التشغيلي مهما أرسل العميل
      status: d.status === "confirmed" ? "confirmed" : "planned",
      deliveryApproved: false,
      deliveryApprovedBy: null,
      deliveryApprovedAt: null,
      returnApproved: false,
      returnApprovedBy: null,
      returnApprovedAt: null,
      supervisorDeliveredToWarehouse: false,
      supervisorDeliveredToWarehouseAt: null,
      warehouseReturnConfirmed: false,
      warehouseReturnConfirmedBy: null,
      warehouseReturnConfirmedAt: null,
      isPaid: false,
      paidAt: null,
      paidBy: null,
      createdAt: Timestamp.now(),
      createdBy: uid,
    });
  });
  return { id: concertRef.id, concertNumber };
}

/** الحقول التي يُسمح للعميل بتعديلها — كل ما عداها يُتجاهل.
 *  الأرقام المشتقّة (deposit، تكاليف المواد والمصروفات) والعلامات
 *  التشغيلية لها مساراتها الخاصة فلا تُقبل هنا. */
const EDITABLE = new Set([
  "name", "date", "venueName", "peopleCount", "location", "price", "clientName",
  "clientPhone", "clientPhone2", "supervisorIds", "employeeIds", "notes",
  "hallCostType", "hallCostValue", "hallCostDate", "hallCostRecipient", "vatRate",
]);

export async function svcUpdateConcert(db: Firestore, id: string, d: Record<string, unknown>) {
  const ref = db.collection("concerts").doc(id);
  if (!(await ref.get()).exists) throw new ApiError("الحفلة غير موجودة", 404);

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (EDITABLE.has(k)) patch[k] = v;
  // التاريخ يُعاد إلى Timestamp مهما وصل نصاً أو خريطة
  if (patch.date !== undefined) {
    const ts = toTimestamp(patch.date);
    if (!ts) throw new ApiError("تاريخ الحفلة غير صحيح");
    patch.date = ts;
  }
  if (Object.keys(patch).length === 0) throw new ApiError("لا يوجد ما يُعدَّل");
  await ref.update(patch);
}

export async function svcDeleteConcert(db: Firestore, id: string) {
  // يُفرج عن كل ما تحجزه ثم تُحذف — وإلا بقي الحجز معلّقاً للأبد
  await svcReleaseConcertStock(db, id, true);
  await db.collection("concerts").doc(id).delete();
}

export async function svcCancelConcert(
  db: Firestore,
  id: string,
  d: { reason: string; refundAmount: number | null; refundDate: string | null; refundMethod: string | null }
) {
  const ref = db.collection("concerts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  if (snap.data()!.status === "cancelled") throw new ApiError("الحفلة ملغاة أصلاً");

  await svcReleaseConcertStock(db, id); // الملغاة لا تحجز موارد
  await ref.update({
    status: "cancelled",
    cancelledAt: Timestamp.now(),
    cancellationReason: d.reason || null,
    refundAmount: d.refundAmount || null,
    refundDate: d.refundDate || null,
    refundMethod: d.refundMethod || null,
  });
}

export async function svcMarkPaid(db: Firestore, id: string, uid: string) {
  const ref = db.collection("concerts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  if (snap.data()!.status === "cancelled") throw new ApiError("لا يمكن إتمام حفلة ملغاة");

  await ref.update({ isPaid: true, paidAt: Timestamp.now(), paidBy: uid, status: "completed" });
}

/** العلامات التشغيلية — كلٌّ يكتب علامته ووقتها وصاحبها */
const FLAGS: Record<string, (uid: string) => Record<string, unknown>> = {
  delivery: (uid) => ({ deliveryApproved: true, deliveryApprovedBy: uid, deliveryApprovedAt: Timestamp.now() }),
  executing: (uid) => ({ executingStarted: true, executingStartedBy: uid, executingStartedAt: Timestamp.now() }),
  return: (uid) => ({ returnApproved: true, returnApprovedBy: uid, returnApprovedAt: Timestamp.now() }),
  toWarehouse: () => ({ supervisorDeliveredToWarehouse: true, supervisorDeliveredToWarehouseAt: Timestamp.now() }),
};

export async function svcSetConcertFlag(db: Firestore, id: string, flag: string, uid: string) {
  const build = FLAGS[flag];
  if (!build) throw new ApiError("خطوة غير معروفة");
  const ref = db.collection("concerts").doc(id);
  if (!(await ref.get()).exists) throw new ApiError("الحفلة غير موجودة", 404);
  await ref.update(build(uid));
}

export async function svcSetLocation(db: Firestore, id: string, loc: { lat: number; lng: number; address: string }) {
  await db.collection("concerts").doc(id).update({ location: loc });
}

/* ── فواتير المصروفات ──────────────────────────────────────── */

/** يعيد كتابة تكاليف الحفلة من فواتيرها — تماماً كما يُشتق المدفوع
 *  من الدفعات. يُستدعى بعد كل إضافة أو حذف فاتورة. */
async function recalcExpenses(db: Firestore, concertId: string) {
  const [snap, settings, concertSnap] = await Promise.all([
    db.collection("concert_expenses").where("concertId", "==", concertId).get(),
    db.collection("expense_settings").doc("config").get(),
    db.collection("concerts").doc(concertId).get(),
  ]);

  const kindByName = new Map<string, string>();
  for (const t of (settings.data()?.types ?? []) as { name: string; kind: string }[]) {
    kindByName.set(t.name, t.kind);
  }
  const vatRate = (concertSnap.data()?.vatRate as number) ?? 15;

  let transport = 0, labor = 0, other = 0;
  for (const d of snap.docs) {
    const e = d.data() as { type: string; amount: number; vatIncluded?: boolean };
    // القيمة شاملة الضريبة تُجرَّد منها كي تتجانس كل التكاليف
    const net = e.vatIncluded ? r2((e.amount ?? 0) / (1 + vatRate / 100)) : (e.amount ?? 0);
    const kind = kindByName.get(e.type) ?? "other";
    if (kind === "transport") transport += net;
    else if (kind === "labor") labor += net;
    else other += net;
  }

  await db.collection("concerts").doc(concertId).update({
    transportCost: transport > 0 ? r2(transport) : null,
    laborCost: labor > 0 ? r2(labor) : null,
    otherExpensesCost: other > 0 ? r2(other) : null,
  });
}

export async function svcAddExpense(
  db: Firestore,
  d: {
    concertId: string; type: string; description: string | null; amount: number;
    vatIncluded: boolean; invoiceDate: string; supplierName: string | null; createdBy: string;
  }
) {
  const cSnap = await db.collection("concerts").doc(d.concertId).get();
  if (!cSnap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  const status = cSnap.data()!.status;
  // فاتورة السيارة تصل بعد الحفلة كثيراً، فتُقبل على المكتملة أيضاً —
  // لكن لا على غير المؤكدة ولا الملغاة
  if (status === "planned") throw new ApiError("تُضاف الفواتير بعد تأكيد الحفلة");
  if (status === "cancelled") throw new ApiError("لا تُضاف فواتير على حفلة ملغاة");

  const ref = db.collection("concert_expenses").doc();
  await ref.set({
    ...d,
    concertNumber: cSnap.data()!.concertNumber ?? null,
    clientName: cSnap.data()!.clientName ?? null,
    createdAt: Timestamp.now(),
  });
  await recalcExpenses(db, d.concertId);
  return { id: ref.id };
}

export async function svcDeleteExpense(db: Firestore, id: string) {
  const ref = db.collection("concert_expenses").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الفاتورة غير موجودة", 404);
  const concertId = snap.data()!.concertId as string;
  await ref.delete();
  await recalcExpenses(db, concertId);
}

/* ── أصناف الأكل في الحفلة ─────────────────────────────────── */

export async function svcAddConcertFood(
  db: Firestore,
  d: { concertId: string; categoryId: string; categoryName: string; selectedOption: string; quantity: number | null; notes: string | null; createdBy: string }
) {
  if (!(await db.collection("concerts").doc(d.concertId).get()).exists) {
    throw new ApiError("الحفلة غير موجودة", 404);
  }
  const ref = db.collection("concert_food").doc();
  await ref.set({ ...d, createdAt: Timestamp.now() });
  return { id: ref.id };
}

export async function svcUpdateConcertFood(db: Firestore, id: string, d: { quantity?: number | null; notes?: string | null }) {
  const patch: Record<string, unknown> = {};
  if (d.quantity !== undefined) patch.quantity = d.quantity;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (Object.keys(patch).length === 0) return;
  await db.collection("concert_food").doc(id).update(patch);
}

export async function svcDeleteConcertFood(db: Firestore, id: string) {
  await db.collection("concert_food").doc(id).delete();
}

/* ── سجل الحفلة ────────────────────────────────────────────── */

export async function svcAddLog(
  db: Firestore,
  d: { concertId: string; description: string; field?: string; oldValue?: string; newValue?: string; createdBy: string }
) {
  const ref = db.collection("concert_logs").doc();
  await ref.set({ ...d, createdAt: Timestamp.now() });
  return { id: ref.id };
}
