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
import { Concert, ConcertItem } from "@/types";
import { WarehouseRequest } from "@/types";

export async function createConcert(
  data: Omit<Concert, "id" | "createdAt" | "deliveryApproved" | "deliveryApprovedBy" | "deliveryApprovedAt" | "returnApproved" | "returnApprovedBy" | "returnApprovedAt" | "supervisorDeliveredToWarehouse" | "supervisorDeliveredToWarehouseAt" | "warehouseReturnConfirmed" | "warehouseReturnConfirmedBy" | "warehouseReturnConfirmedAt">
): Promise<Concert> {
  const ref = await addDoc(collection(db, "concerts"), {
    ...data,
    location: data.location ?? null,
    price: data.price,
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
