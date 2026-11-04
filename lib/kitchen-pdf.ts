import { aggregateKitchenOrders, kitchenConcertName, type KitchenExportOrder, type KitchenExportFilters } from "./kitchen-export";
import { toLatinDigits } from "./utils";

const clean = (value: string) => toLatinDigits(value.normalize("NFKC")).trim().replace(/\s+/g, " ");
const esc = (value: unknown) => toLatinDigits(String(value ?? "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** Combine identical item/category pairs, without converting unknown quantities to zero. */
export function kitchenPdfRows(orders: KitchenExportOrder[]) {
  const totals = aggregateKitchenOrders(orders,true);
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
  const sections=categories.map(category=>({category,items:rows.filter(row=>row.category===category)}));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تجميع أصناف المطبخ</title><style>
  @font-face{font-family:Cairo;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:100 900}
  @page{size:A4 portrait}*{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;color:#1c2d50;font-size:9px;line-height:1.5;margin:0}
  h1{font-size:15px;margin:0 0 3px}.heading{border-bottom:2px solid #1c2d50;padding-bottom:5px;margin-bottom:7px;flex:none}.heading p{margin:0;color:#64748b;font-size:9px}.concerts{margin-top:4px;overflow-wrap:anywhere}.separator{color:#94a3b8;padding:0 4px}.pdf-page{width:196mm;height:276mm;display:flex;flex-direction:column;break-after:page}.pdf-page:last-child{break-after:auto}.pdf-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0}.pdf-column{min-width:0;min-height:0}.section{margin-bottom:8px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#eef2f8;font-weight:normal;text-align:center}.category-heading th{background:#1c2d50;color:white;text-align:right;font-size:10px;font-weight:bold}th,td{padding:3px 4px;border:1px solid #d4dce8;vertical-align:middle;overflow-wrap:anywhere}td{text-align:right}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:center;font-family:Arial,sans-serif;direction:ltr;font-variant-numeric:tabular-nums}.warn{background:#fffbeb;color:#92400e}.notes{font-size:8px}
  </style></head><body><header class="heading"><h1>تجميع أصناف المطبخ</h1><p>${orders.length} حفلة | ${categories.length} قسم | ${rows.length} صنف — الكميات مجمعة داخل كل قسم</p><div class="concerts"><strong>الحفلات المشمولة: </strong>${orders.map(order => `<span>${esc(kitchenConcertName(order))}</span>`).join('<span class="separator"> • </span>')}</div></header>
  <main class="pdf-source">${sections.map(({category,items}) => `<section class="section"><table aria-label="${esc(category || "أصناف غير مصنفة")}"><colgroup><col style="width:42%"><col style="width:12%"><col style="width:23%"><col style="width:23%"></colgroup><thead><tr class="category-heading"><th colspan="4">${esc(category || "أصناف غير مصنفة")}</th></tr><tr><th>اسم الصنف</th><th>العدد</th><th>ملاحظات 1</th><th>ملاحظات 2</th></tr></thead><tbody>${items.map(row => `<tr><td>${esc(row.itemName)}</td><td class="num ${row.missing ? "warn" : ""}">${row.quantity == null ? "غير محدد" : esc(row.quantity.toLocaleString("en-US", { maximumFractionDigits: 9 }))}</td><td class="notes">${esc(row.note1)}</td><td class="notes">${esc(row.note2)}</td></tr>`).join("")}</tbody></table></section>`).join("")}</main></body></html>`;
}
