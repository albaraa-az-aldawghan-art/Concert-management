/** Quantities are stored in the stock unit; purchase conversions are snapshotted. */
export type MaterialRequestState = "open" | "partial" | "awaiting_invoice" | "completed" | "cancelled";
export type MaterialReceiptState = "awaiting_invoice" | "posted" | "void";

export interface MaterialRequestLine {
  barcode: string;
  name: string;
  unit: string;
  purchaseUnit: string;
  purchaseToIssue: number;
  enteredUnit: "stock" | "purchase";
  enteredQuantity: number;
  requested: number;
  received: number;
  posted: number;
  cancelled: number;
  balanceAtRequest: number;
  minimumAtRequest: number;
}
export interface MaterialRequest {
  id: string;
  number: string;
  source: "manual" | "automatic";
  state: MaterialRequestState;
  createdBy: string;
  requestDate: string;
  createdAt: string;
  updatedAt: string;
  lastReceivedAt: string | null;
  notes: string;
  cancelReason?: string;
  lines: MaterialRequestLine[];
}
export interface MaterialReceiptLine {
  barcode: string;
  name: string;
  unit: string;
  purchaseUnit: string;
  purchaseToIssue: number;
  quantity: number;
  priceBeforeVat?: number;
}
export interface MaterialReceipt {
  id: string;
  requestId: string;
  state: MaterialReceiptState;
  receivedDate: string;
  createdAt: string;
  createdBy: string;
  supplierName: string;
  notes: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  postedAt?: string;
  lines: MaterialReceiptLine[];
}
export interface MaterialChoice {
  id: string;
  name: string;
  unit: string;
  purchaseUnit: string;
  purchaseToIssue: number;
  balance: number;
  minimumStock: number;
  openQuantity: number;
  pendingInvoiceQuantity: number;
  autoEnabled: boolean;
  targetStock: number;
}
export const MATERIAL_STATES: Record<MaterialRequestState, string> = {
  open: "بانتظار التوريد", partial: "مستلم جزئيًا", awaiting_invoice: "بانتظار الفاتورة",
  completed: "مكتمل", cancelled: "أُلغي المتبقي",
};
export const materialRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const materialRemaining = (line: Pick<MaterialRequestLine, "requested" | "received" | "cancelled">) =>
  Math.max(0, materialRound(line.requested - line.received - line.cancelled));
export function materialState(lines: MaterialRequestLine[]): MaterialRequestState {
  const pending = lines.some(line => line.received - line.posted > 0.001);
  if (pending) return "awaiting_invoice";
  if (lines.every(line => materialRemaining(line) === 0)) {
    return lines.some(line => line.cancelled > 0) ? "cancelled" : "completed";
  }
  return lines.some(line => line.received > 0) ? "partial" : "open";
}
export function automaticMaterialQuantity(item: {
  kind?: string; totalIn?: number; totalOut?: number; minimumStock?: number;
  materialAutoEnabled?: boolean; materialTargetStock?: number;
  materialOpenQuantity?: number; materialPendingQuantity?: number;
}): number {
  if ((item.kind ?? "raw") !== "raw" || item.materialAutoEnabled !== true) return 0;
  const balance = materialRound((item.totalIn ?? 0) - (item.totalOut ?? 0));
  const minimum = item.minimumStock ?? 0;
  const target = item.materialTargetStock ?? 0;
  if (![balance, minimum, target].every(Number.isFinite) || target <= minimum || balance > minimum) return 0;
  return Math.max(0, materialRound(target - balance - (item.materialOpenQuantity ?? 0) - (item.materialPendingQuantity ?? 0)));
}
export function materialSearchKey(value: string): string {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim().toLowerCase();
}
