/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Concert, ConcertItem, ConcertPayment, ConcertLog } from "@/types";

export async function createConcert(
  data: Omit<Concert, "id" | "concertNumber" | "createdAt" | "deliveryApproved" | "deliveryApprovedBy" | "deliveryApprovedAt" | "returnApproved" | "returnApprovedBy" | "returnApprovedAt" | "supervisorDeliveredToWarehouse" | "supervisorDeliveredToWarehouseAt" | "warehouseReturnConfirmed" | "warehouseReturnConfirmedBy" | "warehouseReturnConfirmedAt" | "isPaid" | "paidAt" | "paidBy">
): Promise<Concert> {
  // الرقم التسلسلي والعلامات التشغيلية تُكتب على الخادم
  const { id } = await api.post<{ id: string; concertNumber: number }>("/api/concerts", {
    ...data,
    date: data.date ? { seconds: data.date.seconds, nanoseconds: data.date.nanoseconds } : null,
  });
  const snap = await getDoc(doc(db, "concerts", id));
  return { id, ...snap.data() } as Concert;
}

export async function getConcerts(): Promise<Concert[]> {
  const snap = await getDocs(
    query(collection(db, "concerts"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Concert));
}

/** الحفلات القادمة فقط (من الأمس فصاعداً) — تُستعمل لحساب المرتبط
 *  بالخامات. قراءة محدودة بدل المجموعة كاملة كي لا تنمو مع الأرشيف. */
export async function getUpcomingConcerts(): Promise<Concert[]> {
  const from = Timestamp.fromMillis(Date.now() - 86400000);
  const snap = await getDocs(query(collection(db, "concerts"), where("date", ">=", from)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Concert));
}

export async function getConcertById(id: string): Promise<Concert | null> {
  const snap = await getDoc(doc(db, "concerts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Concert;
}

export async function getConcertsBySupervisor(supervisorId: string): Promise<Concert[]> {
  const snap = await getDocs(
    query(
      collection(db, "concerts"),
      where("supervisorIds", "array-contains", supervisorId)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Concert))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function getConcertsByEmployee(employeeId: string): Promise<Concert[]> {
  const snap = await getDocs(
    query(
      collection(db, "concerts"),
      where("employeeIds", "array-contains", employeeId)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Concert))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function updateConcert(id: string, data: Partial<Concert>) {
  await api.patch(`/api/concerts/${id}`, data);
}

export async function deleteConcert(id: string) {
  await api.del(`/api/concerts/${id}`);
}

export async function approveDelivery(concertId: string, supervisorId: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag: "delivery" });
}

export async function setConcertLocation(
  concertId: string,
  location: { lat: number; lng: number; address: string }
) {
  await api.post(`/api/concerts/${concertId}/flag`, { location });
}

export async function advanceToExecuting(concertId: string, uid: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag: "executing" });
}

export async function approveReturn(concertId: string, supervisorId: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag: "return" });
}

export async function supervisorDeliverToWarehouse(concertId: string, uid: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag: "toWarehouse" });
}

/** تنفيذ خطوة من سير العمل مباشرة — يستكمل معها ما قبلها */
export async function runWorkflowStep(concertId: string, flag: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag });
}

/** التراجع عن خطوة — يُسقط ما بعدها */
export async function undoWorkflowStep(concertId: string, flag: string) {
  await api.post(`/api/concerts/${concertId}/flag`, { flag, undo: true });
}

/** التراجع عن تأكيد الموارد — يُعيد حجز ما أُفرج عنه */
export async function undoWarehouseReturn(concertId: string) {
  await api.del(`/api/concerts/${concertId}/return`);
}

export async function updateDeposit(concertId: string, newDeposit: number) {
  await updateDoc(doc(db, "concerts", concertId), { deposit: newDeposit });
}

export async function markConcertAsPaid(concertId: string, uid: string) {
  await api.post(`/api/concerts/${concertId}/paid`);
}

/** تأكيد استلام مواد الحفلة: يُعاد المحجوز إلى الموارد ما عدا المفقود.
 *  آمن التكرار وآمن الانقطاع — كل مادة في معاملة مستقلة تتحقق من
 *  stockHeld أولاً، وعلامة الحفلة تُكتب في النهاية. */
export async function confirmWarehouseReturn(concertId: string, uid: string) {
  await api.post(`/api/concerts/${concertId}/return`);
}

// Concert Logs
export async function addConcertLog(data: Omit<ConcertLog, "id" | "createdAt">): Promise<void> {
  await api.post(`/api/concerts/${data.concertId}/logs`, data);
}

export async function getConcertLogs(concertId: string): Promise<ConcertLog[]> {
  const snap = await getDocs(
    query(collection(db, "concert_logs"), where("concertId", "==", concertId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertLog))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

// Concert Payments
export async function getConcertPayments(concertId: string): Promise<ConcertPayment[]> {
  const snap = await getDocs(
    query(collection(db, "concert_payments"), where("concertId", "==", concertId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertPayment))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

/** رقم الفاتورة يجب ألا يتكرّر في دفعتين — فاتورة مكرّرة في الدفاتر
 *  لا يكشفها شيء لاحقاً. يُرجع الدفعة المتعارضة إن وُجدت. */
export async function findPaymentByInvoiceNumber(
  invoiceNumber: string,
  excludePaymentId?: string
): Promise<ConcertPayment | null> {
  const num = invoiceNumber.trim();
  if (!num) return null;
  const snap = await getDocs(
    query(collection(db, "concert_payments"), where("invoiceNumber", "==", num))
  );
  const hit = snap.docs.find((d) => d.id !== excludePaymentId);
  return hit ? ({ id: hit.id, ...hit.data() } as ConcertPayment) : null;
}

async function assertInvoiceNumberFree(num: string | null | undefined, excludeId?: string) {
  if (!num) return;
  const clash = await findPaymentByInvoiceNumber(num, excludeId);
  if (clash) {
    throw new Error(
      `رقم الفاتورة ${num} مستخدم في دفعة أخرى (${clash.amount.toLocaleString("en-US")} ريال${clash.date ? ` بتاريخ ${clash.date}` : ""})`
    );
  }
}

export async function addConcertPayment(
  data: Omit<ConcertPayment, "id" | "createdAt">
): Promise<void> {
  await api.post("/api/payments", { ...data, confirmConcert: true });
}

export async function addConcertPaymentRecord(
  data: Omit<ConcertPayment, "id" | "createdAt">
): Promise<void> {
  await api.post("/api/payments", { ...data, confirmConcert: false });
}

/** تعديل بيانات دفعة قائمة — حالة الفاتورة تُراجَع لاحقاً عادةً.
 *  المبلغ ليس ضمنها لأن تغييره يستوجب إعادة حساب deposit. */
export async function updateConcertPayment(
  paymentId: string,
  data: Partial<Pick<ConcertPayment, "hasInvoice" | "invoiceRegistered" | "invoiceNumber">>
): Promise<void> {
  await api.patch(`/api/payments/${paymentId}`, data);
}

export async function deleteConcertPayment(paymentId: string, concertId: string): Promise<void> {
  await api.del(`/api/payments/${paymentId}`);
}

// Concert Items
/* ── دفتر حجز الموارد ──────────────────────────────────────────
   إضافة مادة لحفلة تحجزها فوراً من «المتوفر»، وحذفها أو تأكيد
   إرجاعها يُفرج عنها. كل ذلك داخل معاملة واحدة حتى لا يتسبب
   طلبان متزامنان في حجز نفس الكمية مرتين.

   علامة stockHeld على المادة هي مفتاح السلامة: تُكتب من هذا الكود
   فقط، فالمواد المسجّلة قبل تفعيل الحجز لا تُعاد أبداً، ولا يمكن
   الإفراج عن نفس المادة مرتين مهما تكرر النداء. */

/** هل تحجز هذه الحفلة موارد؟ الحفلة المكتملة أو الملغاة أو التي استُلمت
 *  موادها لا تحجز — إضافة مادة إليها تصحيح سجل لا حجز فعلي. */
function concertHoldsStock(c: { warehouseReturnConfirmed?: boolean; status?: string }): boolean {
  return !c.warehouseReturnConfirmed && c.status !== "cancelled" && c.status !== "completed";
}

export async function addConcertItem(
  data: Omit<ConcertItem, "id" | "createdAt" | "deliveryStatus" | "returnStatus">
): Promise<ConcertItem> {
  const { id } = await api.post<{ id: string }>(`/api/concerts/${data.concertId}/items`, data);
  const snap = await getDoc(doc(db, "concert_items", id));
  return { id, ...snap.data() } as ConcertItem;
}

/** تعديل الكمية — يعدّل الحجز بالفرق فقط */
export async function updateConcertItemCount(itemId: string, newCount: number): Promise<void> {
  await api.patch(`/api/concerts/_/items/${itemId}`, { count: newCount });
}

/** يعيد حساب قيمتي مواد الحفلة من الموارد:
 *  - externalItemsCost: المواد المستأجرة — تكلفة نقدية فعلية تدخل في الربح
 *  - internalItemsValue: المواد المملوكة — قيمة الأصول الموظّفة، للعرض فقط
 *    ولا تُخصم من الربح لأنها ترجع بعد الحفلة وتُستعمل مرات كثيرة */
export async function updateConcertItemCosts(concertId: string): Promise<void> {
  // تُحتسب على الخادم بعد كل تغيير في المواد — تُترك هنا للتوافق
  return;
}

export async function getConcertItems(concertId: string): Promise<ConcertItem[]> {
  const snap = await getDocs(
    query(collection(db, "concert_items"), where("concertId", "==", concertId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConcertItem));
}

export async function getConcertItemsByEmployee(
  concertId: string,
  employeeId: string
): Promise<ConcertItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "concert_items"),
      where("concertId", "==", concertId),
      where("assignedToEmployeeId", "==", employeeId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConcertItem));
}

export async function updateConcertItem(id: string, data: Partial<ConcertItem>) {
  await api.patch(`/api/concerts/_/items/${id}`, data);
}

export async function deleteConcertItem(id: string) {
  await api.del(`/api/concerts/_/items/${id}`);
}

/** يُفرج عن كل ما تحجزه الحفلة — يُستدعى عند الإلغاء أو حذف الحفلة.
 *  آمن التكرار: المادة المُفرَج عنها تصبح stockHeld=false فلا تُعاد ثانية. */
export async function releaseConcertStock(concertId: string, alsoDeleteItems = false): Promise<void> {
  // الإفراج صار جزءاً من الإلغاء والحذف على الخادم — تُترك للتوافق
  void concertId; void alsoDeleteItems;
  return;
}

export async function confirmItemDelivery(itemId: string) {
  await api.patch(`/api/concerts/_/items/${itemId}`, { deliveryStatus: "confirmed" });
}

export async function confirmItemReturn(itemId: string) {
  await api.patch(`/api/concerts/_/items/${itemId}`, { returnStatus: "confirmed" });
}

export async function markItemHasMissing(itemId: string) {
  await api.patch(`/api/concerts/_/items/${itemId}`, { returnStatus: "has_missing" });
}

export async function cancelConcert(
  concertId: string,
  data: {
    reason: string;
    refundAmount: number | null;
    refundDate: string | null;
    refundMethod: string | null;
    /** لكل عملية صرف على الحفلة: كم رجع للمخزون وكم تلف */
    settlements?: { outgoingId: string; returnedQty: number; damagedQty: number; reason: string }[];
  }
): Promise<void> {
  await api.post(`/api/concerts/${concertId}/cancel`, data);
}
