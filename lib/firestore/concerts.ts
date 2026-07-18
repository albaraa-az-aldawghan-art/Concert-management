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
import { increaseAvailableCount } from "@/lib/firestore/warehouse";
import { Concert, ConcertItem, ConcertPayment, ConcertLog } from "@/types";
import { WarehouseRequest } from "@/types";

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
  await deleteDoc(doc(db, "concerts", id));
}

export async function approveDelivery(concertId: string, supervisorId: string) {
  const snap = await getDoc(doc(db, "concerts", concertId));
  const hasLocation = !!(snap.data()?.location);
  await updateDoc(doc(db, "concerts", concertId), {
    deliveryApproved: true,
    deliveryApprovedBy: supervisorId,
    deliveryApprovedAt: Timestamp.now(),
    status: hasLocation ? "location_set" : "active",
  });
}

export async function setConcertLocation(
  concertId: string,
  location: { lat: number; lng: number; address: string }
) {
  const snap = await getDoc(doc(db, "concerts", concertId));
  const currentStatus = snap.data()?.status;
  const update: Record<string, unknown> = { location };
  if (currentStatus === "active") update.status = "location_set";
  await updateDoc(doc(db, "concerts", concertId), update);
}

export async function advanceToMaterialsRequested(concertId: string) {
  await updateDoc(doc(db, "concerts", concertId), { status: "materials_requested" });
}

export async function advanceToLocationSet(concertId: string) {
  await updateDoc(doc(db, "concerts", concertId), { status: "location_set" });
}

export async function advanceToExecuting(concertId: string) {
  await updateDoc(doc(db, "concerts", concertId), { status: "executing" });
}

export async function approveReturn(concertId: string, supervisorId: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    returnApproved: true,
    returnApprovedBy: supervisorId,
    returnApprovedAt: Timestamp.now(),
    status: "materials_returned",
  });
}

export async function supervisorDeliverToWarehouse(concertId: string, uid: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    supervisorDeliveredToWarehouse: true,
    supervisorDeliveredToWarehouseAt: Timestamp.now(),
    status: "delivered_to_warehouse",
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

export async function confirmWarehouseReturn(concertId: string, uid: string) {
  const reqSnap = await getDocs(
    query(collection(db, "warehouse_requests"), where("concertId", "==", concertId))
  );
  const approved = reqSnap.docs
    .map((d) => d.data() as WarehouseRequest)
    .filter((r) => r.status === "approved");

  await Promise.all(approved.map((r) => increaseAvailableCount(r.itemId, r.requestedCount)));

  await updateDoc(doc(db, "concerts", concertId), {
    warehouseReturnConfirmed: true,
    warehouseReturnConfirmedBy: uid,
    warehouseReturnConfirmedAt: Timestamp.now(),
    status: "warehouse_confirmed",
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
export async function addConcertItem(
  data: Omit<ConcertItem, "id" | "createdAt" | "deliveryStatus" | "returnStatus">
): Promise<ConcertItem> {
  const ref = await addDoc(collection(db, "concert_items"), {
    ...data,
    unitCost: data.unitCost ?? null,
    totalCost: data.totalCost ?? null,
    deliveryStatus: "pending",
    returnStatus: "pending",
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as ConcertItem;
}

export async function updateConcertExternalCost(concertId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "concert_items"), where("concertId", "==", concertId))
  );
  const allItems = snap.docs.map((d) => d.data() as ConcertItem);
  const externalCost = allItems
    .filter((i) => i.type === "external")
    .reduce((sum, i) => sum + ((i.totalCost as number) ?? 0), 0);
  await updateDoc(doc(db, "concerts", concertId), {
    externalItemsCost: externalCost > 0 ? externalCost : null,
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
  await deleteDoc(doc(db, "concert_items", id));
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
  await updateDoc(doc(db, "concerts", concertId), {
    status: "cancelled",
    cancelledAt: Timestamp.now(),
    cancellationReason: data.reason || null,
    refundAmount: data.refundAmount || null,
    refundDate: data.refundDate || null,
    refundMethod: data.refundMethod || null,
  });
}
