import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { toLatinDigits } from "./utils";
import { getWeekBounds } from "./date-period";

export type CustomerPdfRecord = Pick<ConcertCustomerSummary,
  "name" | "primaryPhone" | "secondaryPhone" | "firstRegisteredAt" |
  "firstCreatedByName" | "source" | "concertCount" | "totalValue" |
  "totalCollected" | "totalRemaining" | "lastConcertAt" | "totalRefunded" |
  "concerts" | "payments"
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

const escapeHtml = (value: unknown) => toLatinDigits(String(value ?? ""))
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
    { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Riyadh" },
  );
}

const STATUS: Record<string, string> = { planned: "غير مؤكدة", confirmed: "مؤكدة", completed: "مكتملة", cancelled: "ملغاة" };
function paymentMethod(payment: CustomerPdfRecord["payments"][number]) {
  if (payment.method === "card") return payment.cardType === "mada" ? "مدى" : payment.cardType === "visa" ? "فيزا" : "شبكة";
  return ({ cash: "نقد", bank_transfer: "تحويل بنكي" } as Record<string, string>)[payment.method] || payment.method || "غير مسجلة";
}
function cards(values: [string, string][]) {
  return `<div class="summary">${values.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>`;
}

function customerStatement(customer: CustomerPdfRecord) {
  const received = customer.concerts.reduce((sum, concert) => sum + concert.paid, 0);
  const cancelledReceived = customer.concerts.filter((concert) => concert.status === "cancelled").reduce((sum, concert) => sum + concert.paid, 0);
  const concerts = [...customer.concerts].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id.localeCompare(b.id));
  const introduction = `
    <h2>${escapeHtml(customer.name)}</h2>
    <p class="sub">الجوال: <bdi>${escapeHtml(customer.primaryPhone || "—")}</bdi> | الجوال الإضافي: <bdi>${escapeHtml(customer.secondaryPhone || "—")}</bdi> | أول تسجيل: ${dateText(customer.firstRegisteredAt)} | المسجل بواسطة: ${escapeHtml(customer.firstCreatedByName || "—")} | المصدر: ${escapeHtml(customer.source || "غير محدد")}</p>
    ${cards([["عدد الحفلات (يشمل الملغاة)", String(concerts.length)], ["قيمة الحفلات غير الملغاة", `${money(customer.totalValue)} ريال`], ["المحصّل للحفلات غير الملغاة", `${money(customer.totalCollected)} ريال`], ["المتبقي المستحق", `${money(customer.totalRemaining)} ريال`], ["المبالغ المستردة", `${money(customer.totalRefunded)} ريال`]])}
    <p class="sub">إجمالي الدفعات لجميع الحفلات: <bdi>${money(received)}</bdi> ريال | منها للحفلات الملغاة: <bdi>${money(cancelledReceived)}</bdi> ريال | صافي المقبوض بعد الاسترداد: <bdi>${money(received - customer.totalRefunded)}</bdi> ريال</p>
    `;
  return `<section class="customer">${concerts.length ? "" : introduction}
    ${concerts.map((concert, index) => {
      const payments = customer.payments.filter((payment) => payment.concertId === concert.id).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id));
      const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
      // Small unbroken tables avoid Chromium clipping repeated headers on long ledgers.
      const chunks = payments.length ? Array.from({ length: Math.ceil(payments.length / 8) }, (_, n) => payments.slice(n * 8, n * 8 + 8)) : [[]];
      const heading = `<div class="concert-heading"><h3>الحفلة ${index + 1} - رقم <bdi>#${escapeHtml(concert.concertNumber ?? "—")}</bdi> - ${escapeHtml(STATUS[concert.status] || concert.status)}</h3>
        <p class="sub">تاريخ الحفلة: ${dateText(concert.date)} | المكان: ${escapeHtml(concert.venueName || "غير مسجل")} | عدد الأشخاص: ${escapeHtml(concert.peopleCount || "غير مسجل")} | تاريخ التسجيل: ${dateText(concert.createdAt)} | رقم الفاتورة: <bdi>${escapeHtml(concert.invoiceNumber || "غير مسجل")}</bdi></p>
        ${cards([[concert.status === "cancelled" ? "قيمة الحفلة قبل الإلغاء (غير مستحقة)" : "قيمة الحفلة", `${money(concert.price)} ريال`], ["المدفوع", `${money(concert.paid)} ريال`], ["المتبقي المستحق", `${money(concert.remaining)} ريال`], ["المسترد", `${money(concert.refundAmount)} ريال`], ["صافي المقبوض", `${money(concert.paid - concert.refundAmount)} ريال`]])}</div>
        `;
      return `<div class="concert ${concert.status === "cancelled" ? "cancelled" : ""}">
        ${chunks.map((chunk, chunkIndex) => `<div class="payment-block">${chunkIndex === 0 ? `${index === 0 ? introduction : ""}${heading}` : ""}<table><thead><tr><th style="width:6%">الدفعة</th><th style="width:13%">تاريخ الدفع</th><th style="width:13%">المبلغ (ريال)</th><th style="width:13%">طريقة الدفع</th><th style="width:26%">تفاصيل الدفع<small class="table-context">العميل: ${escapeHtml(customer.name)}<br>الحفلة #${escapeHtml(concert.concertNumber ?? "—")} - ${dateText(concert.date)}</small></th><th style="width:13%">المسجل بواسطة</th><th style="width:16%">تاريخ تسجيل الدفعة</th></tr></thead><tbody>
        ${chunk.map((payment, n) => `<tr><td class="number">${chunkIndex * 8 + n + 1}</td><td>${dateText(payment.date)}</td><td class="number collected">${money(payment.amount)}</td><td>${escapeHtml(paymentMethod(payment))}</td><td>${escapeHtml([payment.bankName && `البنك: ${payment.bankName}`, payment.senderName && `المرسل: ${payment.senderName}`, payment.receiverName && `المستلم: ${payment.receiverName}`].filter(Boolean).join(" | ") || "غير مسجلة")}</td><td>${escapeHtml(payment.createdByName || "غير مسجل")}</td><td>${dateText(payment.createdAt)}</td></tr>`).join("") || '<tr><td colspan="7">لا توجد دفعات مسجلة لهذه الحفلة</td></tr>'}
        ${chunkIndex === chunks.length - 1 ? `<tr class="payment-total"><td colspan="2">مجموع الدفعات</td><td class="number">${money(paymentTotal)}</td><td colspan="4">${payments.length} دفعة</td></tr>` : ""}</tbody></table></div>`).join("")}
        ${Math.abs(paymentTotal - concert.paid) > 0.009 ? `<p class="warning">تنبيه مطابقة: مجموع سجلات الدفعات ${money(paymentTotal)} ريال لا يطابق المدفوع ${money(concert.paid)} ريال. لا توجد تفاصيل مؤكدة للفرق.</p>` : ""}
        ${concert.refundAmount > 0 ? '<p class="sub">الاسترداد مبلغ مستقل مسجل على الحفلة؛ لا تتوفر في السجل الحالي تفاصيل تاريخ أو طريقة الاسترداد.</p>' : ""}
      </div>`;
    }).join("")}
  </section>`;
}

function activeFilterText(filters: CustomerPdfFilters = {}, now = new Date()) {
  const labels: string[] = [];
  if (filters.search) labels.push(`البحث: ${filters.search}`);
  if (filters.dateFrom) labels.push(`من: ${dateText(filters.dateFrom)}`);
  if (filters.dateTo) labels.push(`إلى: ${dateText(filters.dateTo)}`);
  if (filters.period === "week" || filters.period === "next-week") {
    const [from, to] = getWeekBounds(now, filters.period === "next-week" ? 1 : 0);
    labels.push(`آخر حفلة: ${filters.period === "next-week" ? "الأسبوع القادم" : "هذا الأسبوع"} (${dateText(from)} - ${dateText(to)})`);
  }
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
  /* Legacy overview retained alongside detailed statements. */
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
  @page { size: A4 landscape; margin: 9mm 9mm 12mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; color-scheme: light; }
  body { margin: 0; color: #172033; font-family: "CairoPdf", Arial, Tahoma, sans-serif; direction: ltr; }
  h1, .sub, .summary, table { direction: rtl; }
  h1 { margin: 0; color: #1c2d50; font-size: 21px; text-align: right; }
  .sub { margin: 3px 0 6px; color: #64748b; font-size: 10px; line-height: 1.55; }
  .summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; margin-bottom: 6px; }
  .card { border: 1px solid #d8e0eb; border-radius: 5px; padding: 4px 7px; background: #f8fafc; }
  .card span { display: block; color: #64748b; font-size: 8px; line-height: 1.4; margin-bottom: 2px; }
  .card b { display: block; color: #1c2d50; font-size: 11px; line-height: 1.4; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5px; }
  thead { display: table-header-group; }
  th { padding: 4px; background: #1c2d50; color: white; border: 1px solid #314468; font-weight: 700; }
  td { padding: 4px; border: 1px solid #d8e0eb; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  tbody tr { background: #ffffff; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tr { break-inside: avoid; }
  .name { width: 12%; text-align: right; font-weight: 700; }
  .phone, .number { direction: ltr; white-space: nowrap; }
  .collected { color: #059669; font-weight: 700; }
  .due { color: #dc2626; font-weight: 700; }
  .empty { padding: 35px; color: #94a3b8; font-size: 12px; }
  .customer { direction: rtl; margin-top: 12px; }
  h2 { margin: 0; padding: 4px 9px; background: #1c2d50; color: white; font-size: 16px; line-height: 1.5; }
  h3 { margin: 0; font-size: 12px; line-height: 1.5; color: #1c2d50; }
  .concert { margin: 8px 0; }
  .concert-heading { break-inside: avoid; border-top: 1px solid #d8e0eb; padding-top: 5px; }
  .cancelled h3 { color: #dc2626; }
  .cancelled .card { background: #fff1f2; }
  .customer table { font-size: 10px; line-height: 1.5; break-inside: avoid; margin-bottom: 4px; }
  .payment-block { break-inside: avoid; display: flow-root; padding-top: 1px; }
  .payment-block + .payment-block { margin-top: 5px; }
  .customer thead { display: table-row-group; }
  .table-context { display: block; font-size: 7.5px; line-height: 1.4; font-weight: normal; color: #e2e8f0; }
  .payment-total { background: #eef2f7; font-weight: bold; }
  .warning { border: 1px solid #fbbf24; padding: 6px; font-size: 10px; background: #fffbeb; }
  bdi { direction: ltr; unicode-bidi: isolate; }
</style></head><body>
  <h1>كشف حساب عملاء الحفلات</h1>
  <p class="sub">تاريخ التصدير: ${escapeHtml(dateText(generatedAt.toISOString()))} - يشمل التقرير النتائج المطابقة للفلاتر فقط</p>
  <p class="sub"><b>الفلاتر المطبقة:</b> ${escapeHtml(activeFilterText(options.filters, generatedAt))}</p>
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
  <p class="sub">جميع المبالغ بالريال. قيمة الحفلات والمحصّل في الملخص يستبعدان الحفلات الملغاة؛ تظهر دفعاتها واسترداداتها في التفاصيل. نطاق التاريخ يخص تاريخ الحفلة، وتظهر جميع دفعات الحفلات ضمن النطاق حتى لو كان تاريخ الدفع خارجه.</p>
  ${customers.map(customerStatement).join("")}
</body></html>`;
}
