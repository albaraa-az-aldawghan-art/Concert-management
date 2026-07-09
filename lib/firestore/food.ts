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
import { FoodCategory, ConcertFood } from "@/types";

export async function getFoodCategories(): Promise<FoodCategory[]> {
  const snap = await getDocs(
    query(collection(db, "food_categories"), orderBy("createdAt", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FoodCategory));
}

export async function addFoodCategory(
  data: Omit<FoodCategory, "id" | "createdAt">
): Promise<FoodCategory> {
  const ref = await addDoc(collection(db, "food_categories"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as FoodCategory;
}

export async function updateFoodCategory(id: string, data: Partial<FoodCategory>) {
  await updateDoc(doc(db, "food_categories", id), data as Record<string, unknown>);
}

export async function deleteFoodCategory(id: string) {
  await deleteDoc(doc(db, "food_categories", id));
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
