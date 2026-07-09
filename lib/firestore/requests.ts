import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WarehouseRequest } from "@/types";

export async function createRequest(
  data: Omit<WarehouseRequest, "id" | "status" | "approvedBy" | "approvedAt" | "createdAt">
): Promise<WarehouseRequest> {
  const ref = await addDoc(collection(db, "warehouse_requests"), {
    ...data,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    createdAt: Timestamp.now(),
  });

  const concertSnap = await getDoc(doc(db, "concerts", data.concertId));
  if (concertSnap.data()?.status === "confirmed") {
    await updateDoc(doc(db, "concerts", data.concertId), { status: "materials_requested" });
  }

  const snap = await getDoc(ref);
  return { id: ref.id, ...snap.data() } as WarehouseRequest;
}

export async function getAllRequests(): Promise<WarehouseRequest[]> {
  const snap = await getDocs(
    query(collection(db, "warehouse_requests"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WarehouseRequest));
}

export async function getRequestsByConcert(concertId: string): Promise<WarehouseRequest[]> {
  const snap = await getDocs(
    query(
      collection(db, "warehouse_requests"),
      where("concertId", "==", concertId)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WarehouseRequest))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function getPendingRequests(): Promise<WarehouseRequest[]> {
  const snap = await getDocs(
    query(
      collection(db, "warehouse_requests"),
      where("status", "==", "pending")
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WarehouseRequest))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function approveRequest(requestId: string, approvedBy: string) {
  await updateDoc(doc(db, "warehouse_requests", requestId), {
    status: "approved",
    approvedBy,
    approvedAt: Timestamp.now(),
  });
}

export async function rejectRequest(requestId: string, approvedBy: string) {
  await updateDoc(doc(db, "warehouse_requests", requestId), {
    status: "rejected",
    approvedBy,
    approvedAt: Timestamp.now(),
  });
}
