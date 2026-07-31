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
import { Concert, ConcertItem, ConcertPayment, ConcertLog } from "@/types";

export async function createConcert(
  data: Omit<Concert, "id" | "concertNumber" | "createdAt" | "deliveryApproved" | "deliveryApprovedBy" | "deliveryApprovedAt" | "returnApproved" | "returnApprovedBy" | "returnApprovedAt" | "supervisorDeliveredToWarehouse" | "supervisorDeliveredToWarehouseAt" | "warehouseReturnConfirmed" | "warehouseReturnConfirmedBy" | "warehouseReturnConfirmedAt" | "isPaid" | "paidAt" | "paidBy">
): Promise<Concert> {
  const counterRef = doc(db, "counters", "concerts");
  let concertNumber = 1;
  let newDocRef: ReturnType<typeof doc>;

  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    concertNumber = counterSnap.exists()
      ? (counterSnap.data().lastNumber ?? 0) + 1
      : 1;
    tx.set(counterRef, { lastNumber: concertNumber });

    newDocRef = doc(collection(db, "concerts"));
    tx.set(newDocRef, {
      ...data,
      concertNumber,
      location: data.location ?? null,
      price: data.price,
      deposit: data.deposit ?? null,
      clientName: data.clientName ?? null,
      clientPhone: data.clientPhone ?? null,
      clientPhone2: data.clientPhone2 ?? null,
      venueName: data.venueName ?? null,
      peopleCount: data.peopleCount ?? null,
      status: data.status ?? "planned",
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
      notes: data.notes ?? null,
      hallCostType: data.hallCostType ?? null,
      hallCostValue: data.hallCostValue ?? null,
      hallCostDate: data.hallCostDate ?? null,
      hallCostRecipient: data.hallCostRecipient ?? null,
      transportCost: data.transportCost ?? null,
      laborCount: data.laborCount ?? null,
      laborPricePerUnit: data.laborPricePerUnit ?? null,
      laborCost: data.laborCost ?? null,
      vatRate: data.vatRate ?? null,
      externalItemsCost: data.externalItemsCost ?? null,
      createdAt: Timestamp.now(),
    });
  });

  const snap = await getDoc(newDocRef!);
  return { id: newDocRef!.id, ...snap.data() } as Concert;
}

export async function getConcerts(): Promise<Concert[]> {
  const snap = await getDocs(
    query(collection(db, "concerts"), orderBy("createdAt", "desc"))
  );
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
  await updateDoc(doc(db, "concerts", id), data as Record<string, unknown>);
}

export async function deleteConcert(id: string) {
  // يُفرَج عن كل ما تحجزه الحفلة وتُحذف موادها، وإلا بقي الحجز معلّقاً للأبد
  await releaseConcertStock(id, true);
  await deleteDoc(doc(db, "concerts", id));
}

export async function approveDelivery(concertId: string, supervisorId: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    deliveryApproved: true,
    deliveryApprovedBy: supervisorId,
    deliveryApprovedAt: Timestamp.now(),
  });
}

export async function setConcertLocation(
  concertId: string,
  location: { lat: number; lng: number; address: string }
) {
  await updateDoc(doc(db, "concerts", concertId), { location });
}

export async function advanceToExecuting(concertId: string, uid: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    executingStarted: true,
    executingStartedAt: Timestamp.now(),
    executingStartedBy: uid,
  });
}

export async function approveReturn(concertId: string, supervisorId: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    returnApproved: true,
    returnApprovedBy: supervisorId,
    returnApprovedAt: Timestamp.now(),
  });
}

export async function supervisorDeliverToWarehouse(concertId: string, uid: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    supervisorDeliveredToWarehouse: true,
    supervisorDeliveredToWarehouseAt: Timestamp.now(),
  });
}

export async function updateDeposit(concertId: string, newDeposit: number) {
  await updateDoc(doc(db, "concerts", concertId), { deposit: newDeposit });
}

export async function markConcertAsPaid(concertId: string, uid: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    isPaid: true,
    paidAt: Timestamp.now(),
    paidBy: uid,
    status: "completed",
  });
}

/** تأكيد استلام مواد الحفلة: يُعاد المحجوز إلى الموارد ما عدا المفقود.
 *  آمن التكرار وآمن الانقطاع — كل مادة في معاملة مستقلة تتحقق من
 *  stockHeld أولاً، وعلامة الحفلة تُكتب في النهاية. */
export async function confirmWarehouseReturn(concertId: string, uid: string) {
  const [itemsSnap, missingSnap] = await Promise.all([
    getDocs(query(collection(db, "concert_items"), where("concertId", "==", concertId))),
    getDocs(query(collection(db, "missing_items"), where("concertId", "==", concertId))).catch(() => null),
  ]);

  // مجموع المفقود لكل مادة مخزن
  const missingByItem = new Map<string, number>();
  if (missingSnap) {
    for (const d of missingSnap.docs) {
      const m = d.data() as { itemId: string; missingCount: number };
      missingByItem.set(m.itemId, (missingByItem.get(m.itemId) ?? 0) + (m.missingCount ?? 0));
    }
  }

  for (const d of itemsSnap.docs) {
    const itemRef = doc(db, "concert_items", d.id);
    await runTransaction(db, async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) return;
      const item = itemSnap.data() as ConcertItem;
      if (!item.stockHeld) return; // أُفرج عنها سابقاً — لا تُعاد مرتين

      const missing = Math.min(missingByItem.get(item.itemId) ?? 0, item.count);
      const restore = Math.max(item.count - missing, 0);

      if (restore > 0) {
        const whRef = doc(db, "warehouse_items", item.itemId);
        const whSnap = await tx.get(whRef);
        if (whSnap.exists()) {
          const available = (whSnap.data().availableCount as number) ?? 0;
          const total = (whSnap.data().totalCount as number) ?? 0;
          tx.update(whRef, { availableCount: Math.min(available + restore, total) });
        }
      }
      tx.update(itemRef, { stockHeld: false });
    });
    // ما استُهلك من رصيد المفقود لا يُخصم من مادة أخرى بنفس المعرّف
    const used = Math.min(missingByItem.get((d.data() as ConcertItem).itemId) ?? 0, (d.data() as ConcertItem).count);
    if (used > 0) missingByItem.set((d.data() as ConcertItem).itemId, (missingByItem.get((d.data() as ConcertItem).itemId) ?? 0) - used);
  }

  await updateDoc(doc(db, "concerts", concertId), {
    warehouseReturnConfirmed: true,
    warehouseReturnConfirmedBy: uid,
    warehouseReturnConfirmedAt: Timestamp.now(),
  });
}

// Concert Logs
export async function addConcertLog(data: Omit<ConcertLog, "id" | "createdAt">): Promise<void> {
  await addDoc(collection(db, "concert_logs"), { ...data, createdAt: Timestamp.now() });
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

export async function addConcertPayment(
  data: Omit<ConcertPayment, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "concert_payments"), { ...data, createdAt: Timestamp.now() });
  const [payments, concertSnap] = await Promise.all([
    getConcertPayments(data.concertId),
    getDoc(doc(db, "concerts", data.concertId)),
  ]);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const update: Record<string, unknown> = { deposit: total };
  if (concertSnap.data()?.status === "planned") update.status = "confirmed";
  await updateDoc(doc(db, "concerts", data.concertId), update);
}

export async function addConcertPaymentRecord(
  data: Omit<ConcertPayment, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "concert_payments"), { ...data, createdAt: Timestamp.now() });
}

export async function deleteConcertPayment(paymentId: string, concertId: string): Promise<void> {
  await deleteDoc(doc(db, "concert_payments", paymentId));
  const payments = await getConcertPayments(concertId);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  await updateDoc(doc(db, "concerts", concertId), { deposit: total });
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
  const itemRef = doc(collection(db, "concert_items"));
  const whRef = doc(db, "warehouse_items", data.itemId);
  const concertRef = doc(db, "concerts", data.concertId);

  await runTransaction(db, async (tx) => {
    const [concertSnap, whSnap] = await Promise.all([tx.get(concertRef), tx.get(whRef)]);
    const hold = concertSnap.exists() && concertHoldsStock(concertSnap.data() as Concert);

    if (hold && whSnap.exists()) {
      const available = (whSnap.data().availableCount as number) ?? 0;
      if (available < data.count) {
        throw new Error(`الكمية المتوفرة من "${data.itemName}" غير كافية (المتوفر: ${available})`);
      }
      tx.update(whRef, { availableCount: available - data.count });
    }

    tx.set(itemRef, {
      ...data,
      unitCost: data.unitCost ?? null,
      totalCost: data.totalCost ?? null,
      deliveryStatus: "pending",
      returnStatus: "pending",
      stockHeld: hold && whSnap.exists(),
      createdAt: Timestamp.now(),
    });
  });

  const snap = await getDoc(itemRef);
  return { id: itemRef.id, ...snap.data() } as ConcertItem;
}

/** تعديل الكمية — يعدّل الحجز بالفرق فقط */
export async function updateConcertItemCount(itemId: string, newCount: number): Promise<void> {
  const itemRef = doc(db, "concert_items", itemId);
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error("المادة غير موجودة");
    const item = itemSnap.data() as ConcertItem;
    const delta = newCount - item.count;

    if (item.stockHeld && delta !== 0) {
      const whRef = doc(db, "warehouse_items", item.itemId);
      const whSnap = await tx.get(whRef);
      if (whSnap.exists()) {
        const available = (whSnap.data().availableCount as number) ?? 0;
        const total = (whSnap.data().totalCount as number) ?? 0;
        if (delta > 0 && available < delta) {
          throw new Error(`الكمية المتوفرة من "${item.itemName}" غير كافية (المتوفر: ${available})`);
        }
        tx.update(whRef, { availableCount: Math.min(Math.max(available - delta, 0), total) });
      }
    }
    tx.update(itemRef, { count: newCount });
  });
}

/** يعيد حساب قيمتي مواد الحفلة من الموارد:
 *  - externalItemsCost: المواد المستأجرة — تكلفة نقدية فعلية تدخل في الربح
 *  - internalItemsValue: المواد المملوكة — قيمة الأصول الموظّفة، للعرض فقط
 *    ولا تُخصم من الربح لأنها ترجع بعد الحفلة وتُستعمل مرات كثيرة */
export async function updateConcertItemCosts(concertId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "concert_items"), where("concertId", "==", concertId))
  );
  const allItems = snap.docs.map((d) => d.data() as ConcertItem);
  const sumBy = (type: "internal" | "external") =>
    allItems
      .filter((i) => i.type === type)
      .reduce((sum, i) => sum + ((i.totalCost as number) ?? 0), 0);

  const externalCost = sumBy("external");
  const internalValue = sumBy("internal");
  await updateDoc(doc(db, "concerts", concertId), {
    externalItemsCost: externalCost > 0 ? externalCost : null,
    internalItemsValue: internalValue > 0 ? internalValue : null,
  });
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
  await updateDoc(doc(db, "concert_items", id), data as Record<string, unknown>);
}

export async function deleteConcertItem(id: string) {
  const itemRef = doc(db, "concert_items", id);
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) return;
    const item = itemSnap.data() as ConcertItem;
    if (item.stockHeld) {
      const whRef = doc(db, "warehouse_items", item.itemId);
      const whSnap = await tx.get(whRef);
      if (whSnap.exists()) {
        const available = (whSnap.data().availableCount as number) ?? 0;
        const total = (whSnap.data().totalCount as number) ?? 0;
        tx.update(whRef, { availableCount: Math.min(available + item.count, total) });
      }
    }
    tx.delete(itemRef);
  });
}

/** يُفرج عن كل ما تحجزه الحفلة — يُستدعى عند الإلغاء أو حذف الحفلة.
 *  آمن التكرار: المادة المُفرَج عنها تصبح stockHeld=false فلا تُعاد ثانية. */
export async function releaseConcertStock(concertId: string, alsoDeleteItems = false): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "concert_items"), where("concertId", "==", concertId))
  );
  for (const d of snap.docs) {
    const itemRef = doc(db, "concert_items", d.id);
    await runTransaction(db, async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) return;
      const item = itemSnap.data() as ConcertItem;
      if (item.stockHeld) {
        const whRef = doc(db, "warehouse_items", item.itemId);
        const whSnap = await tx.get(whRef);
        if (whSnap.exists()) {
          const available = (whSnap.data().availableCount as number) ?? 0;
          const total = (whSnap.data().totalCount as number) ?? 0;
          tx.update(whRef, { availableCount: Math.min(available + item.count, total) });
        }
      }
      if (alsoDeleteItems) tx.delete(itemRef);
      else if (item.stockHeld) tx.update(itemRef, { stockHeld: false });
    });
  }
}

export async function confirmItemDelivery(itemId: string) {
  await updateDoc(doc(db, "concert_items", itemId), {
    deliveryStatus: "confirmed",
  });
}

export async function confirmItemReturn(itemId: string) {
  await updateDoc(doc(db, "concert_items", itemId), {
    returnStatus: "confirmed",
  });
}

export async function markItemHasMissing(itemId: string) {
  await updateDoc(doc(db, "concert_items", itemId), {
    returnStatus: "has_missing",
  });
}

export async function cancelConcert(
  concertId: string,
  data: {
    reason: string;
    refundAmount: number | null;
    refundDate: string | null;
    refundMethod: string | null;
  }
): Promise<void> {
  // الحفلة الملغاة لا تحجز موارد
  await releaseConcertStock(concertId);
  await updateDoc(doc(db, "concerts", concertId), {
    status: "cancelled",
    cancelledAt: Timestamp.now(),
    cancellationReason: data.reason || null,
    refundAmount: data.refundAmount || null,
    refundDate: data.refundDate || null,
    refundMethod: data.refundMethod || null,
  });
}
