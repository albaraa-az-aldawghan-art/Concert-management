import assert from "node:assert/strict";
import test from "node:test";
import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { buildCustomersWorkbook } from "./customer-export";

const customer: ConcertCustomerSummary = {
  id: "phone_966500000000",
  name: "عميل تجريبي",
  primaryPhone: "0500000000",
  secondaryPhone: "0511111111",
  source: "واتساب",
  referralName: null,
  notes: null,
  firstRegisteredAt: "2026-09-01T10:00:00.000Z",
  firstCreatedBy: "admin",
  firstCreatedByName: "المدير العام",
  lastConcertAt: "2026-10-02T00:00:00.000Z",
  concertCount: 2,
  completedCount: 1,
  cancelledCount: 0,
  upcomingCount: 1,
  totalValue: 12500,
  totalCollected: 10000,
  totalRemaining: 2500,
  totalRefunded: 0,
  concerts: [],
  payments: [],
};

test("customer export is a real formatted xlsx with separate typed columns", async () => {
  const workbook = await buildCustomersWorkbook([customer]);
  const sheet = workbook.getWorksheet("العملاء")!;

  assert.equal(sheet.getCell("A4").value, "العميل");
  assert.equal(sheet.getCell("B4").value, "الجوال الأساسي");
  assert.equal(sheet.getCell("A5").value, "عميل تجريبي");
  assert.equal(sheet.getCell("B5").value, "0500000000");
  assert.equal(sheet.getCell("G5").value, 2);
  assert.equal(sheet.getCell("H5").value, 12500);
  assert.ok(sheet.getCell("D5").value instanceof Date);
  assert.equal(sheet.getColumn(8).numFmt, "#,##0.00");
  assert.equal(sheet.views[0]?.rightToLeft, true);
  assert.equal(sheet.views[0]?.state, "frozen");
  assert.equal(sheet.getTable("ConcertCustomersTable").table.columns.length, 11);

  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  assert.ok(bytes.length > 5000);
});
