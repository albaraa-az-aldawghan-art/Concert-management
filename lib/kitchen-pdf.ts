import { aggregateKitchenOrders, kitchenConcertName, type KitchenExportOrder, type KitchenExportFilters } from "./kitchen-export";
import { eventDateString, riyadhDateString } from "./event-date";
import { periodBounds } from "./date-period";
import { toLatinDigits } from "./utils";

const esc = (value: unknown) => toLatinDigits(String(value ?? "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export function buildKitchenSummaryPdfHtml(orders: KitchenExportOrder[], filters: KitchenExportFilters, fontBase64: string, now = new Date()) {
  const rows = aggregateKitchenOrders(orders);
  if (!rows.length) throw new Error("لا توجد أصناف للتصدير");
  const bounds = filters.date.mode === "custom" ? [filters.date.from, filters.date.to] : periodBounds(filters.date.mode, now);
  const period = filters.date.mode === "all" ? "كل التواريخ" : `من <bdi dir="ltr">${esc(bounds[0] || "البداية")}</bdi> إلى <bdi dir="ltr">${esc(bounds[1] || "النهاية")}</bdi>`;
  const warnings = rows.flatMap(row => row.missingConcertNames.map(name => `<tr><td>${esc(row.name)}</td><td>${esc(name).replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<bdi dir="ltr">$&</bdi>')}</td></tr>`));
  const groups = new Map<string, typeof rows>();
  for (const order of orders) for (const line of order.lines ?? []) {
    const category = toLatinDigits((line.categoryName || "").normalize("NFKC")).trim().replace(/\s+/g, " ") || "أصناف بلا قسم مسجل";
    if (!groups.has(category)) groups.set(category, []);
  }
  for (const row of rows) {
    const category = row.category || "أصناف بلا قسم مسجل";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(row);
  }
  const tables = [...groups].map(([category, items]) => `<table aria-label="أصناف ${esc(category)}"><colgroup><col style="width:6%"><col style="width:34%"><col style="width:12%"><col style="width:30%"><col style="width:18%"></colgroup><thead><tr><th colspan="5" class="category-heading">${esc(category)} <small>(${items.length} صنف)</small></th></tr><tr><th>م</th><th>اسم الصنف</th><th>العدد</th><th>ملاحظات 1</th><th>ملاحظات 2</th></tr></thead><tbody>${items.map((row, index) => `<tr><td class="num">${index + 1}</td><td>${esc(row.name)}</td><td class="num ${row.missingConcertNames.length ? "warn" : ""}">${row.quantity == null ? "غير محدد" : esc(row.quantity.toLocaleString("en-US", { maximumFractionDigits: 9 }))}</td><td>${row.missingConcertNames.length ? esc(`${row.quantity == null ? "كمية غير محددة" : "مجموع جزئي"} - ${row.missingConcertNames.length} حفلة بكمية غير محددة`) : ""}</td><td></td></tr>`).join("")}</tbody></table>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تجميع أصناف المطبخ</title><style>
  @font-face{font-family:Cairo;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:100 900}
  @page{size:A4 portrait}*{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;color:#1c2d50;font-size:10px;line-height:1.65;margin:0}
  h1{font-size:19px;margin:0 0 3px}h2{font-size:13px;margin:17px 0 7px;break-after:avoid}p{margin:4px 0;color:#64748b}
  .heading{border-bottom:2px solid #1c2d50;padding-bottom:9px}.summary{display:flex;gap:8px;margin:12px 0}.summary div{flex:1;background:#eef1f7;border-radius:7px;padding:8px;text-align:center}.summary b{font-size:16px;display:block}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px}thead{display:table-header-group}th{background:#1c2d50;color:white;font-weight:normal}.category-heading{background:#eef1f7;color:#1c2d50;text-align:right;font-size:13px;font-weight:bold;padding:8px}th,td{padding:6px;border:1px solid #d4dce8;vertical-align:middle;overflow-wrap:anywhere}td{text-align:right}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:center;font-family:Arial,sans-serif;direction:ltr;font-variant-numeric:tabular-nums}.warn{background:#fffbeb;color:#92400e}.notice{padding:8px;border:1px solid #fcd34d;border-radius:6px;background:#fffbeb;color:#92400e;break-inside:avoid}
  </style></head><body><header class="heading"><h1>تجميع أصناف الحفلات المستلمة</h1><p>${period} | تاريخ التصدير: <bdi dir="ltr">${esc(riyadhDateString(now))}</bdi></p>${filters.search ? `<p>البحث المطبق: ${esc(filters.search)}</p>` : ""}</header>
  <div class="summary"><div>الحفلات المختارة<b class="num">${orders.length}</b></div><div>الأصناف المجمعة<b class="num">${rows.length}</b></div></div>
  ${warnings.length ? '<p class="notice">توجد كميات غير محددة. لا تُحتسب كصفر؛ المجموع الجزئي يجمع الكميات المعروفة فقط. تفاصيل الحفلات موضحة أسفل التقرير.</p>' : ""}
  ${tables}
  <h2>الحفلات المشمولة بالتجميع</h2><table aria-label="الحفلات المختارة"><thead><tr><th style="width:45%">اسم الحفلة</th><th style="width:20%">تاريخ الحفلة</th><th style="width:35%">المكان</th></tr></thead><tbody>${[...orders].sort((a,b) => eventDateString(a.concertDate).localeCompare(eventDateString(b.concertDate))).map(order => `<tr><td>${esc(kitchenConcertName(order))}</td><td class="num">${esc(eventDateString(order.concertDate) || "غير مسجل")}</td><td>${esc(order.venueName || "غير مسجل")}</td></tr>`).join("")}</tbody></table>
  ${warnings.length ? `<h2>تفاصيل الكميات غير المحددة</h2><table><thead><tr><th style="width:35%">الصنف</th><th>اسم الحفلة والتاريخ والمكان</th></tr></thead><tbody>${warnings.join("")}</tbody></table>` : ""}</body></html>`;
}
