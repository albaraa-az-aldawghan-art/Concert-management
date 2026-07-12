import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { AppUser, UserRole } from "@/types";

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  createdBy: string,
  customRoleId: string | null = null
): Promise<AppUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  const user: AppUser = {
    uid,
    name,
    email,
    role,
    customRoleId,
    createdAt: Timestamp.now(),
    createdBy,
  };

  await setDoc(doc(db, "users", uid), user);
  return user;
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export async function getUserById(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data() as AppUser);
}

export async function getUsersByRole(role: UserRole): Promise<AppUser[]> {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", role))
  );
  return snap.docs.map((d) => d.data() as AppUser);
}

export async function updateUser(uid: string, data: Partial<AppUser>) {
  await updateDoc(doc(db, "users", uid), data as Record<string, unknown>);
}

export async function deleteUser(uid: string) {
  await deleteDoc(doc(db, "users", uid));
}
