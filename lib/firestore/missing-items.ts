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
import { MissingItem } from "@/types";

export async function reportMissingItem(
  data: Omit<MissingItem, "id" | "reportedAt">
): Promise<MissingItem> {
  const ref = await addDoc(collection(db, "missing_items"), {
    ...data,
    reportedAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as MissingItem;
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
