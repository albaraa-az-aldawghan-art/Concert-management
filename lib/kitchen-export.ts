import { matchesDate, type DateFilterState } from "./date-period";
import { toLatinDigits } from "./utils";

export interface KitchenExportOrder {
  id: string; concertId: string; concertNumber: number; clientName: string;
  concertDate: unknown; venueName?: string | null; status: string;
  lines?: { name: string; categoryName?: string; quantity: number | null; notes?: string | null }[];
}
export interface KitchenExportFilters { date: DateFilterState; search: string }
export function matchesKitchenExportOrder(order: KitchenExportOrder, filters: KitchenExportFilters, now = new Date()) {
  const q = toLatinDigits(filters.search.trim()).toLowerCase();
  return matchesDate(order.concertDate, filters.date, now) && (!q ||
    order.clientName.toLowerCase().includes(q) || (order.venueName ?? "").toLowerCase().includes(q) ||
    String(order.concertNumber).padStart(3, "0").includes(q.replace(/^#/, "")));
}
const clean = (value: string) => toLatinDigits(value.normalize("NFKC")).trim().replace(/\s+/g, " ");
export function aggregateKitchenOrders(orders: KitchenExportOrder[]) {
  const seen = new Set<string>();
  const rows = new Map<string, { name: string; category: string; quantity: number }>();
  for (const order of orders) {
    if (order.status !== "received") throw new Error(`الحفلة #${order.concertNumber} لم يُؤكَّد استلامها`);
    if (!order.concertId || seen.has(order.concertId)) throw new Error("تكررت الحفلة في اختيار التصدير — أعد تحميل الطلبات");
    seen.add(order.concertId);
    if (!Array.isArray(order.lines) || !order.lines.length) throw new Error(`الحفلة #${order.concertNumber}: لا توجد أصناف محفوظة في الطلب`);
    for (const line of order.lines) {
      const name = typeof line.name === "string" ? clean(line.name) : "";
      const category = typeof line.categoryName === "string" ? clean(line.categoryName) : "";
      if (!name || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity < 0) {
        throw new Error(`الحفلة #${order.concertNumber}: راجع اسم وكمية الصنف «${name || "غير مسجل"}» قبل التصدير`);
      }
      const key = JSON.stringify([category, name]);
      const row = rows.get(key) ?? { name, category, quantity: 0 };
      row.quantity += line.quantity;
      if (!Number.isFinite(row.quantity) || row.quantity > Number.MAX_SAFE_INTEGER) throw new Error("مجموع الكمية أكبر من الحد المسموح");
      rows.set(key, row);
    }
  }
  const names = new Map<string, number>();
  for (const row of rows.values()) names.set(row.name, (names.get(row.name) ?? 0) + 1);
  return [...rows.values()].map(row => ({
    name: (names.get(row.name) ?? 0) > 1 && row.category ? `${row.name} (${row.category})` : row.name,
    quantity: Number(row.quantity.toFixed(9)),
  })).sort((a,b) => a.name.localeCompare(b.name, "ar"));
}
