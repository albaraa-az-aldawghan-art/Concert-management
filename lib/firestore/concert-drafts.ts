/* مسودات الحفلات: بيانات مؤقتة قيد الإدخال — كتابة مباشرة من المتصفح
   بلا مرور بالخادم، فلا التزام مالي ولا قيد محاسبي يحتاج تحققاً هناك،
   تماماً كإعدادات التكاليف (cost_settings). */

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, orderBy, query, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ConcertDraft } from "@/types";

type DraftPayload = Omit<ConcertDraft, "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName">;

export async function getConcertDrafts(): Promise<ConcertDraft[]> {
  const snap = await getDocs(query(collection(db, "concert_drafts"), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConcertDraft));
}

export async function getConcertDraft(id: string): Promise<ConcertDraft | null> {
  const snap = await getDoc(doc(db, "concert_drafts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ConcertDraft;
}

/** يُنشئ مسودة جديدة إن لم يُمرَّر معرّف، أو يُحدّث القائمة إن مُرِّر */
export async function saveConcertDraft(
  id: string | null,
  data: DraftPayload,
  createdBy: string,
  createdByName: string
): Promise<string> {
  if (id) {
    await updateDoc(doc(db, "concert_drafts", id), { ...data, updatedAt: Timestamp.now() });
    return id;
  }
  const ref = await addDoc(collection(db, "concert_drafts"), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy,
    createdByName,
  });
  return ref.id;
}

export async function deleteConcertDraft(id: string): Promise<void> {
  await deleteDoc(doc(db, "concert_drafts", id));
}
