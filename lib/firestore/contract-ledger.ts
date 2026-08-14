import { api } from "@/lib/api";
import type { ContractDay, ContractExpenseKind } from "@/types";

/* نداءات الجدول اليومي — كلها تمرّ بالخادم: أرقامه مشتقّة وحركته
   تمسّ المخزون، فلا يُكتب منها شيء مباشرةً في قاعدة البيانات. */

export interface MonthItemRow {
  barcode: string; itemName: string; unit: string; salePrice: number;
  category: string | null;
  soldQty: number; revenue: number; cost: number; damaged: number; supplied: number; closing: number;
}

export interface ContractMonth {
  month: string;
  contractName: string;
  days: ContractDay[];
  items: MonthItemRow[];
  expenseLines: { key: string; label: string; kind: string; amount: number }[];
  collections: Record<string, number>;
  totals: {
    sales: number; closingStock: number; soldQty: number;
    cost: number; expenses: number; profit: number; collected: number; variance: number;
  };
  posted: boolean;
}

export function getContractMonth(contractId: string, month: string) {
  return api.get<ContractMonth>(`/api/contracts/${contractId}/days?month=${month}`);
}

export function saveContractDay(
  contractId: string,
  d: {
    date: string;
    lines: { barcode: string; supplied: number; damaged: number; remaining: number }[];
    collections: Record<string, number>;
    expenses: { key: string; amount: number }[];
    custody: number | null;
    notes: string | null;
  }
) {
  return api.put<{ id: string }>(`/api/contracts/${contractId}/days`, d);
}

export function deleteContractDay(contractId: string, date: string) {
  return api.del(`/api/contracts/${contractId}/days/${date}`);
}

export function setLedgerConfig(
  contractId: string,
  d: {
    enabled: boolean;
    expenseLines: { key: string; label: string; kind: ContractExpenseKind }[];
    defaultCustody: number;
    sectionIds: string[];
    departmentName: string | null;
  }
) {
  return api.patch(`/api/contracts/${contractId}/ledger-config`, d);
}

export function postMonthCollections(contractId: string, month: string) {
  return api.post<{ total: number }>(`/api/contracts/${contractId}/post-collections`, { month });
}

export function unpostMonthCollections(contractId: string, month: string) {
  return api.del(`/api/contracts/${contractId}/post-collections?month=${month}`);
}
