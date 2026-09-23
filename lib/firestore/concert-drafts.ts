import { api } from "@/lib/api";
/* مسودات الحفلات: القراءات من المتصفح والحفظ من الخادم لتوثيق النشاط. */

import {
  collection, doc, getDoc, getDocs, orderBy, query,
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
  data: DraftPayload
): Promise<string> {
  const result = await api.post<{ id: string }>("/api/drafts", { id, data });
  return result.id;
}

export async function deleteConcertDraft(id: string): Promise<void> {
  await api.del(`/api/drafts?id=${encodeURIComponent(id)}`);
}
