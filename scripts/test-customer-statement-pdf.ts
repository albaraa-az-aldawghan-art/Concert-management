import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildCustomersPdfHtml, type CustomerPdfRecord } from "../lib/customer-pdf";
import { launchPdfBrowser } from "../lib/server/pdf-browser";
import { loadEnvConfig } from "@next/env";
import { getAdminDb } from "../lib/firebase-admin";
import { listConcertCustomers } from "../lib/server/concert-customers-core";
import { selectCustomerStatements } from "../lib/customer-pdf-scope";

async function main() {
  const customer: CustomerPdfRecord = {
    name: "أحمد محمد - بيانات اختبار", primaryPhone: "0500000001", secondaryPhone: null,
    firstRegisteredAt: "2026-09-01", firstCreatedByName: "محمد هلال", source: "واتساب",
    lastConcertAt: "2026-10-08", concertCount: 3, totalValue: 12500, totalCollected: 8500, totalRemaining: 4000, totalRefunded: 500,
    concerts: [
      { id: "one", concertNumber: 104, date: "2026-10-01", createdAt: "2026-09-01", venueName: "قاعة النور", peopleCount: "150", status: "completed", price: 5000, paid: 5000, remaining: 0, refundAmount: 0, invoiceNumber: "INV-104" },
      { id: "two", concertNumber: 105, date: "2026-10-08", createdAt: "2026-09-20", venueName: "قاعة الياسمين", peopleCount: "200", status: "confirmed", price: 7500, paid: 3500, remaining: 4000, refundAmount: 0, invoiceNumber: "INV-105" },
      { id: "three", concertNumber: 106, date: "2026-10-09", createdAt: "2026-10-01", venueName: "قاعة الأندلس", peopleCount: "100", status: "cancelled", price: 2000, paid: 500, remaining: 0, refundAmount: 500, invoiceNumber: null },
    ],
    payments: [],
  };
  customer.payments = [
    { id: "p1", concertId: "one", concertNumber: 104, amount: 2000, method: "bank_transfer", bankName: "الراجحي", senderName: "أحمد", date: "2026-09-10", createdAt: "2026-09-10", createdBy: "a", createdByName: "المحاسب" },
    { id: "p2", concertId: "one", concertNumber: 104, amount: 3000, method: "card", cardType: "mada", date: "2026-09-20", createdAt: "2026-09-20", createdBy: "a", createdByName: "المحاسب" },
    { id: "p3", concertId: "two", concertNumber: 105, amount: 3500, method: "cash", receiverName: "محمد", date: "2026-10-02", createdAt: "2026-10-02", createdBy: "a", createdByName: "المحاسب" },
    { id: "p4", concertId: "three", concertNumber: 106, amount: 500, method: "card", cardType: "visa", date: "2026-10-03", createdAt: "2026-10-03", createdBy: "a", createdByName: "المحاسب" },
  ];
  // Long payment table exercises repeated headers and page breaks.
  const second: CustomerPdfRecord = { ...customer, name: "خالد علي - بيانات اختبار", concertCount: 1, totalValue: 5000, totalCollected: 5000, totalRemaining: 0, totalRefunded: 0, concerts: [customer.concerts[0]], payments: Array.from({ length: 40 }, (_, i) => ({ ...customer.payments[0], id: `long-${i}`, amount: 125 })) };
  const fontBase64 = await readFile("node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2", "base64");
  let records: CustomerPdfRecord[] = [customer, second];
  const live = process.argv.includes("--live");
  if (live) {
    loadEnvConfig(process.cwd());
    records = selectCustomerStatements(await listConcertCustomers(getAdminDb()), { search: "عبدالله السبيعي", period: "", dateTo: "2026-10-08", frequency: "", financial: "", recorder: "" });
    assert.ok(records.length > 0, "Source customer must exist");
    for (const record of records) for (const concert of record.concerts) {
      const paid = record.payments.filter((p) => p.concertId === concert.id).reduce((sum, p) => sum + p.amount, 0);
      assert.equal(paid, concert.paid);
      assert.equal(concert.remaining, concert.status === "cancelled" ? 0 : Math.max(0, concert.price - paid));
    }
    console.log("Live read-only reconciliation:", records.map((c) => ({ concerts: c.concertCount, payments: c.payments.length, value: c.totalValue, collected: c.totalCollected, remaining: c.totalRemaining })));
  }
  const html = buildCustomersPdfHtml(records, new Date("2026-10-08"), { fontBase64, filters: live ? { search: "عبدالله السبيعي", dateTo: "2026-10-08" } : { dateFrom: "2026-10-01", dateTo: "2026-10-31" } });
  await mkdir("tmp/pdfs", { recursive: true });
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".customer").length), records.length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await writeFile(`tmp/pdfs/customer-statement-${live ? "live" : "test"}.pdf`, await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;font:8px Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' }));
    console.log(`Rendered ${live ? "live" : "test"} customer statement`);
  } finally { await browser.close(); }
}
void main();
