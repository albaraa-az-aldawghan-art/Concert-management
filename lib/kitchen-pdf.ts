import { aggregateKitchenOrders, kitchenConcertName, type KitchenExportOrder, type KitchenExportFilters } from "./kitchen-export";
import { toLatinDigits } from "./utils";

const clean = (value: string) => toLatinDigits(value.normalize("NFKC")).trim().replace(/\s+/g, " ");
const esc = (value: unknown) => toLatinDigits(String(value ?? "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Combine identical item/category pairs, without converting unknown quantities to zero. */
export function kitchenPdfRows(orders: KitchenExportOrder[]) {
  const totals = aggregateKitchenOrders(orders);
  if (!totals.length) throw new Error("لا توجد أصناف للتصدير");
  const groups = new Map<string, Map<string, Set<string>>>();
  for (const order of orders) for (const line of order.lines ?? []) {
    const category = clean(line.categoryName ?? "");
    if (!groups.has(category)) groups.set(category, new Map());
    const items = groups.get(category)!;
    const name = clean(line.name);
    if (!items.has(name)) items.set(name, new Set());
    if (line.notes?.trim()) items.get(name)!.add(clean(line.notes));
  }
  return [...groups].flatMap(([category, items]) => [...items].map(([itemName, notes]) => {
    const total = totals.find(row => row.category === category && row.itemName === itemName)!;
    const missing = total.missingConcertNames.length;
    return { category, itemName, quantity: total.quantity, missing,
      note1: [...notes, missing ? (total.quantity == null ? "الكمية غير محددة" : `مجموع جزئي: الكمية غير محددة في ${missing} حفلة`) : ""].filter(Boolean).join(" | "), note2: "" };
  }));
}

export function buildKitchenSummaryPdfHtml(orders: KitchenExportOrder[], _filters: KitchenExportFilters, fontBase64: string, _now = new Date()) {
  const rows = kitchenPdfRows(orders);
  const categories = [...new Set(rows.map(row => row.category))];
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تجميع أصناف المطبخ</title><style>
  @font-face{font-family:Cairo;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:100 900}
  @page{size:A4 landscape}*{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;color:#1c2d50;font-size:11px;line-height:1.6;margin:0}
  h1{font-size:18px;margin:0 0 3px}.heading{border-bottom:2px solid #1c2d50;padding-bottom:7px;margin-bottom:10px}.heading p{margin:0;color:#64748b;font-size:10px}.concerts{margin-top:5px;overflow-wrap:anywhere}.separator{color:#94a3b8;padding:0 7px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px}thead{display:table-header-group}th{background:#eef2f8;font-weight:normal;text-align:center}.category-heading th{background:#1c2d50;color:white;text-align:right;font-size:13px;font-weight:bold}th,td{padding:5px 7px;border:1px solid #d4dce8;vertical-align:middle;overflow-wrap:anywhere}td{text-align:right}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:center;font-family:Arial,sans-serif;direction:ltr;font-variant-numeric:tabular-nums}.warn{background:#fffbeb;color:#92400e}.notes{font-size:10px}
  </style></head><body><header class="heading"><h1>تجميع أصناف المطبخ</h1><p>${orders.length} حفلة | ${categories.length} قسم | ${rows.length} صنف — الكميات مجمعة داخل كل قسم</p><div class="concerts"><strong>الحفلات المشمولة: </strong>${orders.map(order => `<span>${esc(kitchenConcertName(order))}</span>`).join('<span class="separator"> • </span>')}</div></header>
  ${categories.map(category => `<table aria-label="${esc(category || "أصناف غير مصنفة")}"><colgroup><col style="width:40%"><col style="width:12%"><col style="width:24%"><col style="width:24%"></colgroup><thead><tr class="category-heading"><th colspan="4">${esc(category || "أصناف غير مصنفة")}</th></tr><tr><th>اسم الصنف</th><th>العدد</th><th>ملاحظات 1</th><th>ملاحظات 2</th></tr></thead><tbody>${rows.filter(row => row.category === category).map(row => `<tr><td>${esc(row.itemName)}</td><td class="num ${row.missing ? "warn" : ""}">${row.quantity == null ? "غير محدد" : esc(row.quantity.toLocaleString("en-US", { maximumFractionDigits: 9 }))}</td><td class="notes">${esc(row.note1)}</td><td class="notes">${esc(row.note2)}</td></tr>`).join("")}</tbody></table>`).join("")}</body></html>`;
}
