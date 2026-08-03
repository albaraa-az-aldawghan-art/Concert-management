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
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { FoodCategory, ConcertFood } from "@/types";

export async function getFoodCategories(): Promise<FoodCategory[]> {
  const snap = await getDocs(
    query(collection(db, "food_categories"), orderBy("createdAt", "asc"))
  );
  const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FoodCategory));
  // Sort by order field if present, fall back to createdAt index
  return cats.sort((a, b) => {
    const aOrder = a.order ?? Infinity;
    const bOrder = b.order ?? Infinity;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.createdAt.seconds - b.createdAt.seconds;
  });
}

export async function addFoodCategory(
  data: Omit<FoodCategory, "id" | "createdAt">
): Promise<FoodCategory> {
  // Assign order = current count so new category goes to the end
  const snap = await getDocs(collection(db, "food_categories"));
  const ref = await addDoc(collection(db, "food_categories"), {
    ...data,
    order: snap.size,
    createdAt: Timestamp.now(),
  });
  const docSnap = await getDoc(ref);
  return { id: ref.id, ...docSnap.data() } as FoodCategory;
}

export async function updateFoodCategory(id: string, data: Partial<FoodCategory>) {
  await updateDoc(doc(db, "food_categories", id), data as Record<string, unknown>);
}

export async function deleteFoodCategory(id: string) {
  await deleteDoc(doc(db, "food_categories", id));
}

// Save the new order for all categories in one batch write
export async function updateFoodCategoriesOrder(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, "food_categories", id), { order: index });
  });
  await batch.commit();
}

export async function getConcertFood(concertId: string): Promise<ConcertFood[]> {
  const snap = await getDocs(
    query(collection(db, "concert_food"), where("concertId", "==", concertId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertFood))
    .sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
}

/** كل أصناف الأكل لكل الحفلات — لحساب المرتبط بالحفلات القادمة.
 *  قراءة واحدة تُجمَّع في الذاكرة بدل استعلام لكل حفلة. */
export async function getAllConcertFood(): Promise<ConcertFood[]> {
  const snap = await getDocs(collection(db, "concert_food"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConcertFood));
}

/** أصناف أكل مجموعة حفلات بعينها — Firestore يقبل 30 قيمة في in،
 *  فتُقسَّم المعرّفات إلى حزم. */
export async function getConcertFoodForConcerts(ids: string[]): Promise<ConcertFood[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((ch) => getDocs(query(collection(db, "concert_food"), where("concertId", "in", ch))))
  );
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as ConcertFood)));
}

export async function addConcertFood(
  data: Omit<ConcertFood, "id" | "createdAt">
): Promise<ConcertFood> {
  const { id } = await api.post<{ id: string }>(`/api/concerts/${data.concertId}/food`, data);
  const snap = await getDoc(doc(db, "concert_food", id));
  return { id, ...snap.data() } as ConcertFood;
}

export async function updateConcertFood(id: string, data: Partial<ConcertFood>) {
  await api.patch(`/api/concerts/_/food/${id}`, data);
}

export async function deleteConcertFood(id: string) {
  await api.del(`/api/concerts/_/food/${id}`);
}
