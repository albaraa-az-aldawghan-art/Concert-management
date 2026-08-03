/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { MissingItem } from "@/types";

export async function reportMissingItem(
  data: Omit<MissingItem, "id" | "reportedAt">
): Promise<MissingItem> {
  const { id } = await api.post<{ id: string }>("/api/missing-items", data);
  const snap = await getDoc(doc(db, "missing_items", id));
  return { id, ...snap.data() } as MissingItem;
}

export async function getAllMissingItems(): Promise<MissingItem[]> {
  const snap = await getDocs(
    query(collection(db, "missing_items"), orderBy("reportedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MissingItem));
}

export async function getMissingItemsByConcert(concertId: string): Promise<MissingItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "missing_items"),
      where("concertId", "==", concertId)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MissingItem))
    .sort((a, b) => b.reportedAt.seconds - a.reportedAt.seconds);
}
