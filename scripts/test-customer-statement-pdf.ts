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
  const matchingSource = process.argv.includes("--matching-source");
  if (live) {
    loadEnvConfig(process.cwd());
    records = selectCustomerStatements(await listConcertCustomers(getAdminDb()), { search: matchingSource ? "" : "عبدالله السبيعي", period: "", dateFrom: matchingSource ? "2026-10-08" : "", dateTo: matchingSource ? "2026-10-09" : "2026-10-08", frequency: "", financial: "", recorder: "" });
    if (matchingSource) {
      // Reproduce the ten selected clients in the user's attached report.
      const phones = new Set(["0501846133", "0595413612", "0559499947", "0540426170", "0553922505", "0503222730", "050392572", "0541226233", "0538608925", "0505919262"]);
      records = records.filter((record) => phones.has(record.primaryPhone));
      assert.equal(records.length, 10);
      assert.equal(records.reduce((sum, record) => sum + record.totalValue, 0), 59190);
      assert.equal(records.reduce((sum, record) => sum + record.totalCollected, 0), 48540);
      assert.equal(records.reduce((sum, record) => sum + record.totalRemaining, 0), 10650);
    }
    assert.ok(records.length > 0, "Source customer must exist");
    for (const record of records) for (const concert of record.concerts) {
      const paid = record.payments.filter((p) => p.concertId === concert.id).reduce((sum, p) => sum + p.amount, 0);
      assert.equal(paid, concert.paid);
      assert.equal(concert.remaining, concert.status === "cancelled" ? 0 : Math.max(0, concert.price - paid));
    }
    console.log("Live read-only reconciliation:", records.map((c) => ({ concerts: c.concertCount, payments: c.payments.length, value: c.totalValue, collected: c.totalCollected, remaining: c.totalRemaining })));
  }
  const html = buildCustomersPdfHtml(records, new Date("2026-10-08"), { fontBase64, filters: matchingSource ? { dateFrom: "2026-10-08", dateTo: "2026-10-09" } : live ? { search: "عبدالله السبيعي", dateTo: "2026-10-08" } : { dateFrom: "2026-10-01", dateTo: "2026-10-31" } });
  await mkdir("tmp/pdfs", { recursive: true });
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".customer").length), records.length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".customer h2")].every((heading) => heading.closest(".payment-block")?.querySelector(".concert-heading") && heading.closest(".payment-block")?.querySelector("table"))), true, "Client identity, first concert and payment table must stay in one printable block");
    for (const width of [390, 1280]) {
      await page.setViewport({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    }
    if (matchingSource) {
      await mkdir("output/pdf", { recursive: true });
      await writeFile("output/pdf/customer-statements-compact.pdf", await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;font:8px Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' }));
    }
    await writeFile(`tmp/pdfs/customer-statement-${live ? "live" : "test"}.pdf`, await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;font:8px Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' }));
    console.log(`Rendered ${live ? "live" : "test"} customer statement`);
  } finally { await browser.close(); }
}
void main();
