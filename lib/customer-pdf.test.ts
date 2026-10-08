import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomersPdfHtml, type CustomerPdfRecord } from "./customer-pdf";

const record: CustomerPdfRecord = {
  name: "عميل <تجريبي>", primaryPhone: "0500000000", secondaryPhone: null,
  firstRegisteredAt: "2026-09-01T00:00:00.000Z", firstCreatedByName: "المدير العام", source: "واتساب",
  concertCount: 2, totalValue: 12500, totalCollected: 10000, totalRemaining: 2500,
  lastConcertAt: "2026-10-02T00:00:00.000Z",
  totalRefunded: 0,
  concerts: [{ id: "event-1", concertNumber: 17, date: "2026-10-02", createdAt: "2026-09-01", venueName: "قاعة النور", peopleCount: "100", status: "confirmed", price: 12500, paid: 10000, remaining: 2500, refundAmount: 0, invoiceNumber: "INV-17" }],
  payments: [
    { id: "p2", concertId: "event-1", concertNumber: 17, amount: 6000, method: "bank_transfer", date: "2026-10-01", createdAt: "2026-10-01", createdBy: "admin", createdByName: "أحمد", bankName: "الراجحي", senderName: "خالد" },
    { id: "p1", concertId: "event-1", concertNumber: 17, amount: 4000, method: "card", cardType: "mada", date: "2026-09-20", createdAt: "2026-09-20", createdBy: "admin", createdByName: "أحمد" },
  ],
};

test("تقرير PDF للعملاء أفقي ويحتوي الأرقام الصحيحة ويحمي النص", () => {
  const html = buildCustomersPdfHtml([record], new Date("2026-10-06T00:00:00.000Z"));
  assert.match(html, /A4 landscape/);
  assert.match(html, /عميل &lt;تجريبي&gt;/);
  assert.match(html, /12,500\.00/);
  assert.match(html, /10,000\.00/);
  assert.match(html, /2,500\.00/);
  assert.match(html, /إجمالي العملاء/);
  assert.doesNotMatch(html, /عميل <تجريبي>/);
});

test("كشف الحساب يفصل الحفلات والدفعات وطرق الدفع ويطابق المحصل", () => {
  const html = buildCustomersPdfHtml([record]);
  assert.match(html, /قاعة النور/);
  assert.match(html, /INV-17/);
  assert.match(html, /مدى/);
  assert.match(html, /تحويل بنكي/);
  assert.match(html, /البنك: الراجحي/);
  assert.match(html, /المرسل: خالد/);
  assert.match(html, /4,000\.00/);
  assert.match(html, /6,000\.00/);
  assert.ok(html.indexOf("4,000.00") < html.indexOf("6,000.00"));
  assert.doesNotMatch(html, /تنبيه مطابقة/);
});

test("لا تنسب دفعة عميل لعميل آخر وتعرض الإلغاء والاسترداد والنقص صراحة", () => {
  const second = { ...record, name: "عميل ثان", totalRefunded: 500, concerts: [{ ...record.concerts[0], id: "second", status: "cancelled", refundAmount: 500, paid: 500, remaining: 0 }], payments: [] };
  const html = buildCustomersPdfHtml([record, second]);
  const section = html.slice(html.indexOf('<h2>عميل ثان</h2>'));
  assert.match(section, /ملغاة/);
  assert.match(section, /500\.00/);
  assert.match(section, /لا توجد دفعات مسجلة/);
  assert.match(section, /تنبيه مطابقة/);
  assert.doesNotMatch(section, /الراجحي/);
  assert.doesNotMatch(section, /6,000\.00/);
});

test("أرقام PDF إنجليزية والتواريخ بتوقيت الرياض والنصوص آمنة", () => {
  const html = buildCustomersPdfHtml([{ ...record, primaryPhone: "\u0660\u0665\u0660\u0660\u0660", concerts: [{ ...record.concerts[0], venueName: '<script>alert(1)</script>', peopleCount: "\u0661\u0660\u0660" }] }], new Date("2026-10-07T22:00:00Z"));
  assert.doesNotMatch(html, /[\u0660-\u0669\u06f0-\u06f9]/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /08/);
});

test("تقرير العملاء يضمّن الخط العربي ويعرض نطاق التاريخ المطبق", () => {
  const html = buildCustomersPdfHtml([record], new Date("2026-10-06T00:00:00.000Z"), {
    fontBase64: "Zm9udA==",
    filters: { dateFrom: "2026-09-01", dateTo: "2026-09-30", financial: "due" },
  });
  assert.match(html, /font-family: "CairoPdf"/);
  assert.match(html, /data:font\/woff2;base64,Zm9udA==/);
  assert.match(html, /الفلاتر المطبقة/);
  assert.match(html, /الحالة المالية: عليه متبقي/);
});

test("compact statements keep client identity with first concert and remove forced page gaps", () => {
  const html = buildCustomersPdfHtml([record, { ...record, name: "عميل ثان" }]);
  assert.doesNotMatch(html, /break-before: page/);
  const block = html.slice(html.indexOf('<div class="payment-block">'));
  assert.ok(block.indexOf("<h2>") < block.indexOf('<div class="concert-heading">'));
  assert.ok(block.indexOf('<div class="concert-heading">') < block.indexOf("<table>"));
  assert.match(html, /\.payment-block \{ break-inside: avoid/);
  assert.match(html, /العميل: عميل &lt;تجريبي&gt;/);
});
