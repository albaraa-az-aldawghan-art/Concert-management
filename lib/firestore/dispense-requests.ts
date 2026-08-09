/* طلبات صرف الحفلات: القراءة من المتصفح والإقرار عبر الخادم. */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { DispenseRequest } from "@/types";

export async function getPendingRequests(): Promise<DispenseRequest[]> {
  const snap = await getDocs(
    query(collection(db, "dispense_requests"), where("status", "==", "pending"))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as DispenseRequest))
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function approveRequest(id: string, departmentName: string): Promise<void> {
  await api.post(`/api/dispense-requests/${id}`, { action: "approve", departmentName });
}

export async function rejectRequest(id: string, reason: string): Promise<void> {
  await api.post(`/api/dispense-requests/${id}`, { action: "reject", reason });
}
