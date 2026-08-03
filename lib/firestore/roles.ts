/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
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
  const ref = await addDoc(collection(db, "custom_roles"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as CustomRole;
}

export async function updateCustomRole(id: string, data: Partial<CustomRole>) {
  await updateDoc(doc(db, "custom_roles", id), data as Record<string, unknown>);
}

// Deleting a role that users still hold would strand them with zero access —
// refuse and tell the admin who is blocking.
export async function deleteCustomRole(id: string): Promise<void> {
  const usersSnap = await getDocs(
    query(collection(db, "users"), where("customRoleId", "==", id))
  );
  if (!usersSnap.empty) {
    const names = usersSnap.docs.map((d) => d.data().name).join("، ");
    throw new Error(`لا يمكن حذف الدور — مرتبط بالمستخدمين: ${names}`);
  }
  await deleteDoc(doc(db, "custom_roles", id));
}
