import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomersPdfHtml, type CustomerPdfRecord } from "./customer-pdf";

const record: CustomerPdfRecord = {
  name: "عميل <تجريبي>", primaryPhone: "0500000000", secondaryPhone: null,
  firstRegisteredAt: "2026-09-01T00:00:00.000Z", firstCreatedByName: "المدير العام", source: "واتساب",
  concertCount: 2, totalValue: 12500, totalCollected: 10000, totalRemaining: 2500,
  lastConcertAt: "2026-10-02T00:00:00.000Z",
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
