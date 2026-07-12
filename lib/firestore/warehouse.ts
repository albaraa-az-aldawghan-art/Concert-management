import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WarehouseItem } from "@/types";

export async function addWarehouseItem(
  data: Omit<WarehouseItem, "id" | "createdAt">
): Promise<WarehouseItem> {
  // New items go to the end of the custom order
  const countSnap = await getDocs(collection(db, "warehouse_items"));
  const ref = await addDoc(collection(db, "warehouse_items"), {
    ...data,
    order: countSnap.size,
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...(snap.data() as Omit<WarehouseItem, "id">) };
}

export async function getWarehouseItems(): Promise<WarehouseItem[]> {
  const snap = await getDocs(
    query(collection(db, "warehouse_items"), orderBy("createdAt", "desc"))
  );
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WarehouseItem));
  // Custom drag order first; items created before ordering existed keep
  // their creation order at the end
  return items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

// Persist the new order for all items in one batch write
export async function updateWarehouseItemsOrder(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, "warehouse_items", id), { order: index });
  });
  await batch.commit();
}

export async function getWarehouseItemById(id: string): Promise<WarehouseItem | null> {
  const snap = await getDoc(doc(db, "warehouse_items", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WarehouseItem;
}

export async function updateWarehouseItem(id: string, data: Partial<WarehouseItem>) {
  await updateDoc(doc(db, "warehouse_items", id), data as Record<string, unknown>);
}

export async function deleteWarehouseItem(id: string) {
  await deleteDoc(doc(db, "warehouse_items", id));
}

export async function decreaseAvailableCount(id: string, amount: number) {
  const item = await getWarehouseItemById(id);
  if (!item) throw new Error("الغرض غير موجود");
  if (item.availableCount < amount) throw new Error("الكمية المتوفرة غير كافية");
  await updateDoc(doc(db, "warehouse_items", id), {
    availableCount: item.availableCount - amount,
  });
}

export async function increaseAvailableCount(id: string, amount: number) {
  const item = await getWarehouseItemById(id);
  if (!item) throw new Error("الغرض غير موجود");
  await updateDoc(doc(db, "warehouse_items", id), {
    availableCount: Math.min(item.availableCount + amount, item.totalCount),
  });
}
