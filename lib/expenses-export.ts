/** Exported amounts are integer halalas until the Excel boundary. Missing tax/payment
 * information stays null; an old invoice is not proof that cash was paid. */
export interface ExpenseExportFilters { from: string; to: string }
export interface ExpenseExportRow {
  id: string;
  source: "concert_invoice" | "contract_day" | "expense_voucher";
  department: "concerts" | "contracts" | "general" | "restaurant";
  date: string;
  targetId: string;
  targetName: string;
  targetNumber: string;
  targetStatus: string;
  type: string;
  recipient: string;
  description: string;
  amount: number;
  cash: number | null;
  deduction: number;
  taxNote: string;
  paymentNote: string;
  recordedBy: string;
  warning: string;
  allocations?: {name:string;gross:number;net:number;tax:number}[];
  voucherNumber?: string;
}
export const EXPENSE_DEPARTMENTS = { concerts: "الحفلات", contracts: "التعاقدات", general:"عام",restaurant:"المطعم" };
export const EXPENSE_SOURCES = { concert_invoice: "فاتورة مصروف حفلة", contract_day: "مصروف يوم تشغيل عقد",expense_voucher:"سند صرف" };

export function expenseExportTotals(rows: ExpenseExportRow[]) {
  return rows.reduce((t, r) => ({
    count: t.count + 1,
    amount: t.amount + r.amount,
    cash: t.cash + (r.cash ?? 0),
    deduction: t.deduction + r.deduction,
    undocumentedPayment: t.undocumentedPayment + (r.cash === null ? r.amount : 0),
  }), { count: 0, amount: 0, cash: 0, deduction: 0, undocumentedPayment: 0 });
}
