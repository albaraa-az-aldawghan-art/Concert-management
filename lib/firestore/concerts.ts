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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { increaseAvailableCount } from "@/lib/firestore/warehouse";
import { Concert, ConcertItem, ConcertPayment, ConcertLog } from "@/types";
import { WarehouseRequest } from "@/types";

export async function createConcert(
  data: Omit<Concert, "id" | "createdAt" | "deliveryApproved" | "deliveryApprovedBy" | "deliveryApprovedAt" | "returnApproved" | "returnApprovedBy" | "returnApprovedAt" | "supervisorDeliveredToWarehouse" | "supervisorDeliveredToWarehouseAt" | "warehouseReturnConfirmed" | "warehouseReturnConfirmedBy" | "warehouseReturnConfirmedAt" | "isPaid" | "paidAt" | "paidBy">
): Promise<Concert> {
  const ref = await addDoc(collection(db, "concerts"), {
    ...data,
    location: data.location ?? null,
    price: data.price,
    deposit: data.deposit ?? null,
    clientName: data.clientName ?? null,
    clientPhone: data.clientPhone ?? null,
    clientPhone2: data.clientPhone2 ?? null,
    status: "planned",
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
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as Concert;
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
  await updateDoc(doc(db, "concerts", concertId), {
    deliveryApproved: true,
    deliveryApprovedBy: supervisorId,
    deliveryApprovedAt: Timestamp.now(),
    status: "active",
  });
}

export async function setConcertLocation(
  concertId: string,
  location: { lat: number; lng: number; address: string }
) {
  await updateDoc(doc(db, "concerts", concertId), { location });
}

export async function approveReturn(concertId: string, supervisorId: string) {
  await updateDoc(doc(db, "concerts", concertId), {
    returnApproved: true,
    returnApprovedBy: supervisorId,
    returnApprovedAt: Timestamp.now(),
    status: "completed",
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
  const payments = await getConcertPayments(data.concertId);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  await updateDoc(doc(db, "concerts", data.concertId), { deposit: total });
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
    deliveryStatus: "pending",
    returnStatus: "pending",
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as ConcertItem;
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
