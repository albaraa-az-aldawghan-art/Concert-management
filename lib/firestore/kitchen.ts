import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Concert, KitchenOrder } from "@/types";

// One kitchen order per concert — the doc id IS the concert id, so resending
// simply refreshes the same order (and resets it to "sent" for re-confirmation).
export async function sendConcertToKitchen(concert: Concert, sentBy: string): Promise<void> {
  await setDoc(doc(db, "kitchen_orders", concert.id), {
    concertId: concert.id,
    concertNumber: concert.concertNumber ?? 0,
    clientName: concert.clientName ?? "",
    concertDate: concert.date ?? null,
    venueName: concert.venueName ?? null,
    status: "sent",
    sentAt: Timestamp.now(),
    sentBy,
    receivedAt: null,
    receivedBy: null,
  });
}

export async function getKitchenOrders(): Promise<KitchenOrder[]> {
  const snap = await getDocs(collection(db, "kitchen_orders"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as KitchenOrder))
    .sort((a, b) => (b.sentAt?.seconds ?? 0) - (a.sentAt?.seconds ?? 0));
}

export async function getKitchenOrderByConcert(concertId: string): Promise<KitchenOrder | null> {
  const snap = await getDoc(doc(db, "kitchen_orders", concertId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as KitchenOrder;
}

export async function confirmKitchenOrder(orderId: string, receivedBy: string): Promise<void> {
  await updateDoc(doc(db, "kitchen_orders", orderId), {
    status: "received",
    receivedAt: Timestamp.now(),
    receivedBy,
  });
}

// ── Warehouse orders — same lifecycle as kitchen orders, but the sheet
//    shows ONLY the concert's materials (no food sections) ────────────
export async function sendConcertToWarehouse(concert: Concert, sentBy: string): Promise<void> {
  await setDoc(doc(db, "warehouse_orders", concert.id), {
    concertId: concert.id,
    concertNumber: concert.concertNumber ?? 0,
    clientName: concert.clientName ?? "",
    concertDate: concert.date ?? null,
    venueName: concert.venueName ?? null,
    status: "sent",
    sentAt: Timestamp.now(),
    sentBy,
    receivedAt: null,
    receivedBy: null,
  });
}

export async function getWarehouseOrders(): Promise<KitchenOrder[]> {
  const snap = await getDocs(collection(db, "warehouse_orders"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as KitchenOrder))
    .sort((a, b) => (b.sentAt?.seconds ?? 0) - (a.sentAt?.seconds ?? 0));
}

export async function getWarehouseOrderByConcert(concertId: string): Promise<KitchenOrder | null> {
  const snap = await getDoc(doc(db, "warehouse_orders", concertId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as KitchenOrder;
}

export async function confirmWarehouseOrder(orderId: string, receivedBy: string): Promise<void> {
  await updateDoc(doc(db, "warehouse_orders", orderId), {
    status: "received",
    receivedAt: Timestamp.now(),
    receivedBy,
  });
}

