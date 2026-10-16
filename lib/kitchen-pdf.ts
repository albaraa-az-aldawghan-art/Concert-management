import { aggregateKitchenOrders, kitchenConcertName, type KitchenExportOrder, type KitchenExportFilters } from "./kitchen-export";
import { eventDateString } from "./event-date";
import { toLatinDigits } from "./utils";

const esc = (value: unknown) => toLatinDigits(String(value ?? "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Each quantity stays with its own event/date; never attribute a combined total to one event. */
export function kitchenPdfRows(orders: KitchenExportOrder[]) {
  aggregateKitchenOrders(orders); // Shared validation: received, unique events, valid names/quantities.
  const rows = [...orders].sort((a,b) => eventDateString(a.concertDate).localeCompare(eventDateString(b.concertDate)) || kitchenConcertName(a).localeCompare(kitchenConcertName(b), "ar") || a.concertId.localeCompare(b.concertId))
    .flatMap(order => (order.lines ?? []).map(line => ({
      concertName: kitchenConcertName(order),
      date: eventDateString(order.concertDate),
      itemName: line.name.trim(),
      quantity: line.quantity,
      note1: [line.notes?.trim(), line.quantity == null ? "الكمية غير محددة" : ""].filter(Boolean).join(" | "),
      note2: "",
    })));
  if (!rows.length) throw new Error("لا توجد أصناف للتصدير");
  return rows;
}

export function buildKitchenSummaryPdfHtml(orders: KitchenExportOrder[], _filters: KitchenExportFilters, fontBase64: string, _now = new Date()) {
  const rows = kitchenPdfRows(orders);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أصناف الحفلات المستلمة</title><style>
  @font-face{font-family:Cairo;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:100 900}
  @page{size:A4 landscape}*{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;color:#1c2d50;font-size:11px;line-height:1.6;margin:0}
  h1{font-size:18px;margin:0 0 3px}.heading{border-bottom:2px solid #1c2d50;padding-bottom:7px;margin-bottom:10px}.heading p{margin:0;color:#64748b;font-size:10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#1c2d50;color:white;font-weight:normal;text-align:center}th,td{padding:5px 6px;border:1px solid #d4dce8;vertical-align:middle;overflow-wrap:anywhere}td{text-align:right}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:center;font-family:Arial,sans-serif;direction:ltr;font-variant-numeric:tabular-nums}.warn{background:#fffbeb;color:#92400e}
  </style></head><body><header class="heading"><h1>أصناف الحفلات المستلمة</h1><p>${orders.length} حفلة | ${rows.length} سطر - الكميات مرتبطة بكل حفلة على حدة</p></header>
  <table aria-label="أصناف الحفلات"><colgroup><col style="width:21%"><col style="width:12%"><col style="width:25%"><col style="width:8%"><col style="width:17%"><col style="width:17%"></colgroup><thead><tr><th>اسم الحفلة</th><th>تاريخ الحفلة</th><th>اسم الصنف</th><th>العدد</th><th>ملاحظات 1</th><th>ملاحظات 2</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.concertName)}</td><td class="num">${esc(row.date || "غير مسجل")}</td><td>${esc(row.itemName)}</td><td class="num ${row.quantity == null ? "warn" : ""}">${row.quantity == null ? "غير محدد" : esc(row.quantity.toLocaleString("en-US", { maximumFractionDigits: 9 }))}</td><td>${esc(row.note1)}</td><td>${esc(row.note2)}</td></tr>`).join("")}</tbody></table></body></html>`;
}
