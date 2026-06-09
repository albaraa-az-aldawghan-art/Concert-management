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
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WarehouseItem } from "@/types";

export async function addWarehouseItem(
  data: Omit<WarehouseItem, "id" | "createdAt">
): Promise<WarehouseItem> {
  const ref = await addDoc(collection(db, "warehouse_items"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...(snap.data() as Omit<WarehouseItem, "id">) };
}

export async function getWarehouseItems(): Promise<WarehouseItem[]> {
  const snap = await getDocs(
    query(collection(db, "warehouse_items"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WarehouseItem));
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
