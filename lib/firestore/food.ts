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

export async function addConcertFood(
  data: Omit<ConcertFood, "id" | "createdAt">
): Promise<ConcertFood> {
  const ref = await addDoc(collection(db, "concert_food"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as ConcertFood;
}

export async function updateConcertFood(id: string, data: Partial<ConcertFood>) {
  await updateDoc(doc(db, "concert_food", id), data as Record<string, unknown>);
}

export async function deleteConcertFood(id: string) {
  await deleteDoc(doc(db, "concert_food", id));
}
