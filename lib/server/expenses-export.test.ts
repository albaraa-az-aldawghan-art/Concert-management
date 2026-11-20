import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { expenseExportFilters, expenseHalalas, normalizeExpenseExport, readExpenseExport } from "./expenses-export";
import { buildExpensesWorkbook } from "./expenses-workbook";
import { expenseExportTotals } from "../expenses-export";

const invoices = [
  { id: "shared-a", data: { concertId: "a", invoiceDate: "2026-11-20", amount: 166.67, vatIncluded: true, type: "عمال", supplierName: "المستلم", description: "4 عمال / توزيع مصروف", createdBy: "u" } },
  { id: "shared-b", data: { concertId: "b", invoiceDate: "2026-11-20", amount: 166.67, vatIncluded: false, type: "عمال" } },
  { id: "shared-c", data: { concertId: "c", invoiceDate: "2026-11-20", amount: 166.66, vatIncluded: false, type: "عمال" } },
];
const days = [{ id: "contract_2026-11-21", data: { contractId: "contract", date: "2026-11-21", expenses: [
  { key: "workers", label: "العمال", kind: "from_till", amount: 123.45 },
  { key: "error", label: "مقدار الخطأ", kind: "deduct_collected", amount: 0.1 },
  { key: "empty", label: "صفر", kind: "from_till", amount: 0 },
], totals: { expenses: 123.55 }, updatedBy: "u" } }];
const concerts = new Map([
  ["a", { name: "حفلة أحمد", concertNumber: 1, status: "completed", vatRate: 5, laborCost: 500 }],
  ["b", { name: "حفلة سارة", concertNumber: 2, status: "cancelled", vatRate: 15 }],
]);
const contracts = new Map([["contract", { name: "عقد المطعم", contractNumber: "C-001", status: "active" }]]);
const normalize = () => normalizeExpenseExport(invoices, days, concerts, contracts);

test("exact halalas, zero, floating point tolerances and rejection of corrupt money", () => {
  for (const [v, result] of [[0, 0], [0.1, 10], [0.29, 29], [166.67, 16667], [1_000_000_000, 100_000_000_000]]) assert.equal(expenseHalalas(v, "مبلغ"), result);
  for (const v of [null, undefined, "10", NaN, Infinity, -0.01, 0.001, 1_000_000_001]) assert.throws(() => expenseHalalas(v, "مبلغ"));
});
test("real calendar boundaries, invalid dates and independent all-time scope", () => {
  assert.deepEqual(expenseExportFilters({}), { from: "", to: "" });
  assert.deepEqual(expenseExportFilters({ from: "2024-02-29", to: "2026-11-21" }), { from: "2024-02-29", to: "2026-11-21" });
  for (const input of [null, [], { from: "2026-02-29" }, { to: "2026-11-31" }, { from: "٢٠٢٦-١١-٢١" }, { from: "2026-11-22", to: "2026-11-21" }, { to: "2026-11-21T00:00" }]) assert.throws(() => expenseExportFilters(input));
});
test("all real sources once, cancellation/orphans retained, zero entries excluded", () => {
  const rows = normalize();
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map(r => r.id)).size, 5);
  assert.equal(rows.find(r => r.targetId === "b")?.targetStatus, "ملغاة");
  assert.match(rows.find(r => r.targetId === "c")!.warning, /تعذر/);
  assert.equal(rows[0].targetName, "حفلة أحمد");
  assert.deepEqual(expenseExportTotals(rows), { count: 5, amount: 62355, cash: 12345, deduction: 10, undocumentedPayment: 50000 });
  assert.equal(expenseExportTotals(rows.filter(r => r.source === "concert_invoice")).amount, 50000);
  assert.ok(rows.filter(r => r.source === "concert_invoice").every(r => r.cash === null));
  assert.match(rows.find(r => r.deduction > 0)!.paymentNote, /ليس دفعًا/);
  // A changed sale VAT rate must never fabricate a purchase-tax amount.
  concerts.get("a")!.vatRate = 99;
  assert.deepEqual(normalize(), rows);
});
test("fail rather than export incomplete, duplicate, unbalanced or malformed ledger records", () => {
  const bad = structuredClone(days); bad[0].data.totals.expenses = 100;
  assert.throws(() => normalizeExpenseExport([], bad, concerts, contracts), /لا يطابق/);
  const duplicate = structuredClone(days); duplicate[0].data.expenses.push(duplicate[0].data.expenses[0]);
  assert.throws(() => normalizeExpenseExport([], duplicate, concerts, contracts), /مكرر/);
  assert.throws(() => normalizeExpenseExport([...invoices, invoices[0]], [], concerts, contracts), /مكررة/);
  assert.throws(() => normalizeExpenseExport([{ id: "bad", data: { amount: 12, vatIncluded: true, invoiceDate: "2026-02-30" } }], [], concerts, contracts), /تاريخ/);
  assert.throws(() => normalizeExpenseExport([{ id: "bad", data: { amount: 12, invoiceDate: "2026-11-21" } }], [], concerts, contracts), /الضريبة/);
  assert.throws(() => normalizeExpenseExport([], [{ id: "bad", data: { date: "2026-11-21", totals: { expenses: 5 } } }], concerts, contracts), /غير موجودة/);
});
test("one workbook: preserved values, native dates, cached reconciled formulas, RTL and filters", async () => {
  const rows = normalize();
  rows[0].recipient = '=HYPERLINK("https://invalid", "test")';
  const built = await buildExpensesWorkbook(rows, { from: "", to: "" });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await built.xlsx.writeBuffer());
  assert.deepEqual(book.worksheets.map(s => s.name), ["ملخص المصاريف", "جميع المصاريف"]);
  const sheet = book.getWorksheet("جميع المصاريف")!, summary = book.getWorksheet("ملخص المصاريف")!;
  assert.equal(sheet.getCell("A5").value instanceof Date, true);
  assert.equal(sheet.getCell("A5").text, new Date("2026-11-20T00:00:00Z").toString());
  assert.equal(sheet.getCell("H5").value, rows[0].recipient);
  assert.equal(sheet.getCell("H5").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("I5").value, 166.67);
  assert.equal(sheet.getCell("J5").value, null);
  assert.equal(sheet.getCell("L5").value, 166.67);
  assert.equal(sheet.getCell("I10").result, 623.55);
  assert.equal(sheet.getCell("J10").result, 123.45);
  assert.equal(sheet.getCell("K10").result, 0.1);
  assert.equal(summary.getCell("C7").result, 623.55);
  assert.equal(summary.getCell("D7").result, 123.45);
  assert.equal(summary.getCell("E7").result, 0.1);
  assert.equal(summary.getCell("F7").result, 500);
  assert.equal(summary.getCell("C5").formula, "SUMIFS('جميع المصاريف'!I$5:I$9,'جميع المصاريف'!B$5:B$9,A5)");
  assert.equal(sheet.views[0].rightToLeft, true);
  assert.ok("ySplit" in sheet.views[0]);
  assert.equal(sheet.views[0].ySplit, 4);
  assert.equal(sheet.autoFilter, "A4:R9");
  for (const s of book.worksheets) s.eachRow(row => row.eachCell(cell => {
    assert.ok(!/#[A-Z]+[!?]/.test(cell.text));
    if (cell.type === ExcelJS.ValueType.Formula) assert.ok(Number.isFinite(cell.result));
  }));
});
test("empty data exports explicit zero summary with no invalid ranges or dummy records", async () => {
  const book = await buildExpensesWorkbook([], { from: "2026-11-21", to: "2026-11-21" });
  assert.equal(book.getWorksheet("جميع المصاريف")!.rowCount, 5);
  assert.equal(book.getWorksheet("ملخص المصاريف")!.getCell("C7").result, 0);
  assert.equal(book.getWorksheet("ملخص المصاريف")!.getCell("C5").formula, "0");
  assert.ok((await book.xlsx.writeBuffer()).byteLength > 0);
});

test("all pages read with date boundaries, only referenced targets, no cached totals/stock reads", async () => {
  const reads: string[] = [], refs: string[] = [];
  const fixture: Record<string, { id: string; data: Record<string, unknown> }[]> = { concert_expenses: invoices, contract_days: days };
  function collection(name: string, where: [string, string, string][] = [], limit = Infinity): unknown {
    return { doc: (id: string) => { refs.push(name + "/" + id); return { collection: name, id }; },
      where: (field: string, op: string, value: string) => collection(name, [...where, [field, op, value]], limit),
      limit: (n: number) => collection(name, where, n), get: async () => {
        reads.push(name); const docs = (fixture[name] ?? []).filter(r => where.every(([f, op, v]) => op === ">=" ? String(r.data[f]) >= v : String(r.data[f]) <= v)).slice(0, limit).map(r => ({ id: r.id, data: () => r.data }));
        return { size: docs.length, docs };
      } };
  }
  const db = { collection, getAll: async (...r: { collection: string; id: string }[]) => r.map(ref => ({ id: ref.id, exists: (ref.collection === "concerts" ? concerts : contracts).has(ref.id), data: () => (ref.collection === "concerts" ? concerts : contracts).get(ref.id) })) } as unknown as Parameters<typeof readExpenseExport>[0];
  assert.equal((await readExpenseExport(db, { from: "2026-11-20", to: "2026-11-20" })).length, 3);
  assert.ok(refs.every(p => p.startsWith("concerts/")));
  assert.equal((await readExpenseExport(db, { from: "", to: "" })).length, 5);
  assert.deepEqual([...new Set(reads)].sort(), ["concert_expenses", "contract_days", "expense_vouchers"]);
  fixture.concert_expenses = Array.from({ length: 5001 }, (_, i) => ({ ...invoices[0], id: String(i) }));
  await assert.rejects(readExpenseExport(db, { from: "", to: "" }), /لم يُصدَّر ملف ناقص/);
});
