/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getVatRate(): Promise<number> {
  const snap = await getDoc(doc(db, "settings", "global"));
  if (!snap.exists()) return 15;
  return snap.data().vatRate ?? 15;
}

export async function updateVatRate(rate: number): Promise<void> {
  await setDoc(doc(db, "settings", "global"), { vatRate: rate }, { merge: true });
}
