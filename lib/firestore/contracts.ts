/* التعاقدات: القراءة من المتصفح والكتابة عبر الخادم. */

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Contract, ContractPayment, ContractTerm } from "@/types";

export async function getContracts(): Promise<Contract[]> {
  const snap = await getDocs(collection(db, "contracts"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Contract))
    .sort((a, b) => (b.contractNumber ?? 0) - (a.contractNumber ?? 0));
}

export async function getContractById(id: string): Promise<Contract | null> {
  const snap = await getDoc(doc(db, "contracts", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Contract) : null;
}

export async function getContractPayments(contractId: string): Promise<ContractPayment[]> {
  const snap = await getDocs(
    query(collection(db, "contract_payments"), where("contractId", "==", contractId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ContractPayment))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export interface ContractDraft {
  name: string;
  clientName: string | null;
  clientPhone: string | null;
  startDate: string;
  endDate: string;
  vatRate: number | null;
  totalValue: number | null;
  terms: { barcode: string; quantity: number; unitPrice: number }[];
  notes: string | null;
}

export async function addContract(d: ContractDraft): Promise<string> {
  const { id } = await api.post<{ id: string; contractNumber: number }>("/api/contracts", d);
  return id;
}

export async function updateContract(id: string, d: Partial<ContractDraft>): Promise<void> {
  await api.patch(`/api/contracts/${id}`, d);
}

export async function cancelContract(id: string, reason: string): Promise<void> {
  await api.post(`/api/contracts/${id}/status`, { action: "cancel", reason });
}

export async function completeContract(id: string): Promise<void> {
  await api.post(`/api/contracts/${id}/status`, { action: "complete" });
}

export async function deleteContract(id: string): Promise<void> {
  await api.del(`/api/contracts/${id}`);
}

export async function addContractPayment(
  d: Omit<ContractPayment, "id" | "createdAt" | "invoiceRegistered">
): Promise<void> {
  await api.post("/api/contracts/payments", d);
}

export async function deleteContractPayment(id: string): Promise<void> {
  await api.del(`/api/contracts/payments/${id}`);
}

/** مجموع قيمة البنود — يُعرض بجانب قيمة العقد المكتوبة للمقارنة */
export function termsTotal(terms: ContractTerm[]): number {
  return Math.round(terms.reduce((s, t) => s + (t.total ?? 0), 0) * 100) / 100;
}
