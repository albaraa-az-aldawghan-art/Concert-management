import { api } from "@/lib/api";
/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CustomRole } from "@/types";

export async function getCustomRoles(): Promise<CustomRole[]> {
  const snap = await getDocs(collection(db, "custom_roles"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CustomRole))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

export async function getCustomRoleById(id: string): Promise<CustomRole | null> {
  const snap = await getDoc(doc(db, "custom_roles", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CustomRole;
}

export async function addCustomRole(
  data: Omit<CustomRole, "id" | "createdAt">
): Promise<CustomRole> {
  const { id } = await api.post<{ id: string }>("/api/roles", { data });
  const snap = await getDoc(doc(db, "custom_roles", id));
  return { id, ...snap.data() } as CustomRole;
}

export async function updateCustomRole(id: string, data: Partial<CustomRole>) {
  await api.post("/api/roles", { id, data });
}

// Deleting a role that users still hold would strand them with zero access —
// refuse and tell the admin who is blocking.
export async function deleteCustomRole(id: string): Promise<void> {
  await api.del(`/api/roles?id=${encodeURIComponent(id)}`);
}
