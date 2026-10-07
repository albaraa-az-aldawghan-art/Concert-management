import type { ConcertCustomerSummary } from "@/lib/firestore/customers";

export type CustomerPdfRecord = Pick<ConcertCustomerSummary,
  "name" | "primaryPhone" | "secondaryPhone" | "firstRegisteredAt" |
  "firstCreatedByName" | "source" | "concertCount" | "totalValue" |
  "totalCollected" | "totalRemaining" | "lastConcertAt"
>;

export interface CustomerPdfFilters {
  search?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  frequency?: string;
  financial?: string;
  recorder?: string;
}

export interface CustomerPdfOptions {
  fontBase64?: string;
  filters?: CustomerPdfFilters;
}

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const money = (value: number) => Number.isFinite(value)
  ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : "0.00";

function dateText(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(
    "ar-SA-u-ca-gregory-nu-latn",
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );
}

function activeFilterText(filters: CustomerPdfFilters = {}) {
  const labels: string[] = [];
  if (filters.search) labels.push(`البحث: ${filters.search}`);
  if (filters.dateFrom) labels.push(`من: ${dateText(filters.dateFrom)}`);
  if (filters.dateTo) labels.push(`إلى: ${dateText(filters.dateTo)}`);
  if (filters.period === "month") labels.push("آخر حفلة: هذا الشهر");
  if (filters.period === "year") labels.push("آخر حفلة: هذه السنة");
  if (filters.frequency === "one") labels.push("عدد الحفلات: حفلة واحدة");
  if (filters.frequency === "returning") labels.push("عدد الحفلات: عميل متكرر");
  if (filters.financial === "paid") labels.push("الحالة المالية: مسدد");
  if (filters.financial === "due") labels.push("الحالة المالية: عليه متبقي");
  if (filters.recorder) labels.push(`المسجل بواسطة: ${filters.recorder}`);
  return labels.length > 0 ? labels.join(" | ") : "كل العملاء وجميع الفترات";
}

export function buildCustomersPdfHtml(
  customers: CustomerPdfRecord[],
  generatedAt = new Date(),
  options: CustomerPdfOptions = {},
) {
  const totalConcerts = customers.reduce((sum, customer) => sum + customer.concertCount, 0);
  const totalValue = customers.reduce((sum, customer) => sum + customer.totalValue, 0);
  const totalCollected = customers.reduce((sum, customer) => sum + customer.totalCollected, 0);
  const totalRemaining = customers.reduce((sum, customer) => sum + customer.totalRemaining, 0);
  const fontFace = options.fontBase64
    ? `@font-face { font-family: "CairoPdf"; src: url(data:font/woff2;base64,${options.fontBase64}) format("woff2"); font-weight: 400 800; font-style: normal; font-display: block; }`
    : "";
  const rows = customers.map((customer) => `
    <tr>
      <td class="name">${escapeHtml(customer.name)}</td>
      <td class="phone">${escapeHtml(customer.primaryPhone || "—")}</td>
      <td class="phone">${escapeHtml(customer.secondaryPhone || "—")}</td>
      <td>${escapeHtml(dateText(customer.firstRegisteredAt))}</td>
      <td>${escapeHtml(customer.firstCreatedByName || "—")}</td>
      <td>${escapeHtml(customer.source || "غير محدد")}</td>
      <td class="number">${customer.concertCount.toLocaleString("en-US")}</td>
      <td class="number">${money(customer.totalValue)}</td>
      <td class="number collected">${money(customer.totalCollected)}</td>
      <td class="number ${customer.totalRemaining > 0 ? "due" : ""}">${money(customer.totalRemaining)}</td>
      <td>${escapeHtml(dateText(customer.lastConcertAt))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="ar"><head><meta charset="utf-8" />
<style>
  ${fontFace}
  @page { size: A4 landscape; margin: 12mm 9mm 15mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; color-scheme: light; }
  body { margin: 0; color: #172033; font-family: "CairoPdf", Arial, Tahoma, sans-serif; direction: ltr; }
  h1, .sub, .summary, table { direction: rtl; }
  h1 { margin: 0; color: #1c2d50; font-size: 21px; text-align: right; }
  .sub { margin: 5px 0 13px; color: #64748b; font-size: 10px; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-bottom: 12px; }
  .card { border: 1px solid #d8e0eb; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
  .card span { display: block; color: #64748b; font-size: 8px; margin-bottom: 3px; }
  .card b { color: #1c2d50; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5px; }
  thead { display: table-header-group; }
  th { padding: 7px 4px; background: #1c2d50; color: white; border: 1px solid #314468; font-weight: 700; }
  td { padding: 6px 4px; border: 1px solid #d8e0eb; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  tbody tr { background: #ffffff; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tr { break-inside: avoid; }
  .name { width: 12%; text-align: right; font-weight: 700; }
  .phone, .number { direction: ltr; white-space: nowrap; }
  .collected { color: #059669; font-weight: 700; }
  .due { color: #dc2626; font-weight: 700; }
  .empty { padding: 35px; color: #94a3b8; font-size: 12px; }
</style></head><body>
  <h1>تقرير عملاء الحفلات</h1>
  <p class="sub">تاريخ التصدير: ${escapeHtml(dateText(generatedAt.toISOString()))} - يشمل التقرير النتائج المطابقة للفلاتر فقط</p>
  <p class="sub"><b>الفلاتر المطبقة:</b> ${escapeHtml(activeFilterText(options.filters))}</p>
  <section class="summary">
    <div class="card"><span>إجمالي العملاء</span><b>${customers.length.toLocaleString("en-US")}</b></div>
    <div class="card"><span>إجمالي الحفلات</span><b>${totalConcerts.toLocaleString("en-US")}</b></div>
    <div class="card"><span>إجمالي القيمة</span><b>${money(totalValue)} ريال</b></div>
    <div class="card"><span>المحصّل</span><b>${money(totalCollected)} ريال</b></div>
    <div class="card"><span>المتبقي</span><b class="${totalRemaining > 0 ? "due" : ""}">${money(totalRemaining)} ريال</b></div>
  </section>
  <table><thead><tr>
    <th>العميل</th><th>الجوال الأساسي</th><th>الجوال الإضافي</th><th>أول تسجيل</th>
    <th>المسجل بواسطة</th><th>المصدر</th><th>الحفلات</th><th>إجمالي القيمة</th>
    <th>المحصّل</th><th>المتبقي</th><th>آخر حفلة</th>
  </tr></thead><tbody>${rows || '<tr><td class="empty" colspan="11">لا توجد نتائج مطابقة</td></tr>'}</tbody></table>
</body></html>`;
}
