import { matchesDate, type DateFilterState } from "./date-period";
import { toLatinDigits } from "./utils";
import { eventDateString } from "./event-date";

export interface KitchenExportOrder {
  id: string; concertId: string; concertNumber: number; clientName: string;
  concertName?: string | null;
  concertDate: unknown; venueName?: string | null; status: string;
  lines?: { name: string; categoryName?: string; quantity: number | null; notes?: string | null }[];
}
export interface KitchenExportFilters { date: DateFilterState; search: string; categories?: string[] }
export const kitchenCategory = (value?: string) => toLatinDigits((value ?? "").normalize("NFKC")).trim().replace(/\s+/g, " ") || "أصناف غير مصنفة";
export interface KitchenExportNotice { id: string; name: string; reason: string; code: string }
export interface KitchenExportCandidate { id: string; name: string; categories: string[]; notice?: KitchenExportNotice }
export function kitchenSelectionNotices(candidates: KitchenExportCandidate[], ids: string[], categories?: string[]) {
  return candidates.filter(candidate => ids.includes(candidate.id)).flatMap(candidate => candidate.notice ? [candidate.notice] :
    categories && !candidate.categories.some(category => categories.includes(category)) ? [{ id: candidate.id, name: candidate.name, code: "category-filter", reason: "لا تحتوي أصنافًا من الأقسام المحددة (ليست حفلة فارغة)" }] : []);
}
export function matchesKitchenExportOrder(order: KitchenExportOrder, filters: KitchenExportFilters, now = new Date()) {
  const q = toLatinDigits(filters.search.trim()).toLowerCase();
  return matchesDate(order.concertDate, filters.date, now) && (!q ||
    order.clientName.toLowerCase().includes(q) || (order.concertName ?? "").toLowerCase().includes(q) || (order.venueName ?? "").toLowerCase().includes(q) ||
    String(order.concertNumber).padStart(3, "0").includes(q.replace(/^#/, "")));
}
const clean = (value: string) => toLatinDigits(value.normalize("NFKC")).trim().replace(/\s+/g, " ");
export function kitchenConcertName(order: Pick<KitchenExportOrder, "concertName" | "clientName">) {
  return [order.concertName, order.clientName].map(value=>clean(value || "")).find(Boolean) || "اسم الحفلة غير مسجل";
}
export function kitchenConcertLabel(order: KitchenExportOrder) {
  return [kitchenConcertName(order), eventDateString(order.concertDate), order.venueName].filter(Boolean).join(" | ");
}
export function aggregateKitchenOrders(orders: KitchenExportOrder[], allowPending = false) {
  const seen = new Set<string>();
  const rows = new Map<string, { name: string; category: string; quantity: number; known: boolean; missing: Set<number>; missingNames: Map<string, string> }>();
  for (const order of orders) {
    if (order.status !== "received" && !(allowPending && order.status === "sent")) throw new Error(`الحفلة #${order.concertNumber} لم يُؤكَّد استلامها`);
    if (!order.concertId || seen.has(order.concertId)) throw new Error("تكررت الحفلة في اختيار التصدير — أعد تحميل الطلبات");
    seen.add(order.concertId);
    if (!Array.isArray(order.lines) || !order.lines.length) throw new Error(`الحفلة #${order.concertNumber}: لا توجد أصناف محفوظة في الطلب`);
    for (const line of order.lines) {
      const name = typeof line.name === "string" ? clean(line.name) : "";
      const category = typeof line.categoryName === "string" ? clean(line.categoryName) : "";
      const unspecified = line.quantity == null;
      if (!name || (!unspecified && (typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity < 0))) {
        throw new Error(`الحفلة #${order.concertNumber}: راجع اسم وكمية الصنف «${name || "غير مسجل"}» قبل التصدير`);
      }
      const key = JSON.stringify([category, name]);
      const row = rows.get(key) ?? { name, category, quantity: 0, known: false, missing: new Set<number>(), missingNames: new Map<string, string>() };
      if (unspecified) { row.missing.add(order.concertNumber); row.missingNames.set(order.concertId, kitchenConcertLabel(order)); }
      else { row.quantity += line.quantity!; row.known = true; }
      if (!Number.isFinite(row.quantity) || row.quantity > Number.MAX_SAFE_INTEGER) throw new Error("مجموع الكمية أكبر من الحد المسموح");
      rows.set(key, row);
    }
  }
  const names = new Map<string, number>();
  for (const row of rows.values()) names.set(row.name, (names.get(row.name) ?? 0) + 1);
  return [...rows.values()].map(row => ({
    category: row.category,
    itemName: row.name,
    name: (names.get(row.name) ?? 0) > 1 && row.category ? `${row.name} (${row.category})` : row.name,
    quantity: row.known ? Number(row.quantity.toFixed(9)) : null,
    missingConcertNumbers: [...row.missing],
    missingConcertNames: [...row.missingNames.values()],
  })).sort((a,b) => a.name.localeCompare(b.name, "ar"));
}
