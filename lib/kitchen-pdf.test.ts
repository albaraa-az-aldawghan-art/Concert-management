import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchenSummaryPdfHtml, kitchenPdfRows } from "./kitchen-pdf";
import { kitchenConcertName, type KitchenExportOrder } from "./kitchen-export";
const filters = { date: { mode: "custom" as const, from: "2026-10-01", to: "2026-10-31" }, search: "حفلات" };
const order = (id: number): KitchenExportOrder => ({ id: String(id), concertId: String(id), concertNumber: 900000 + id, concertName: `حفلة مسجلة ${id}`, clientName: "اسم العميل المختلف", concertDate: "2026-10-13", venueName: "قاعة لا يجب عرضها", status: "received", lines: [
  { name: "كشري", categoryName: "الأطباق الرئيسية", quantity: 3 },
  { name: "سلطة", categoryName: "المقبلات", quantity: 2 },
  { name: "حلى", categoryName: "الحلويات", quantity: 0.1 },
] });
test("PDF has exactly one six-column table with event names/dates and no venue or separate sections", () => {
  const orders = Array.from({ length: 35 }, (_, index) => order(index));
  const html = buildKitchenSummaryPdfHtml(orders, filters, "");
  assert.equal((html.match(/<table /g) ?? []).length, 1);
  assert.deepEqual([...html.matchAll(/<th>(.*?)<\/th>/g)].map(match => match[1]), ["اسم الحفلة", "تاريخ الحفلة", "اسم الصنف", "العدد", "ملاحظات 1", "ملاحظات 2"]);
  assert.equal((html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g) ?? []).length, 105);
  for (const item of orders) { assert.ok(html.includes(item.concertName!)); assert.ok(!html.includes(String(item.concertNumber))); }
  for (const unwanted of ["قاعة لا يجب عرضها", "المكان", "category-heading", "الحفلات المشمولة", "تفاصيل الكميات", "تاريخ التصدير", "2026-10-01", "2026-10-31"]) assert.ok(!html.includes(unwanted), unwanted);
});
test("each event keeps its own date and quantity instead of incorrectly receiving a combined total", () => {
  const first = order(1); first.concertDate = "2026-10-15"; first.lines![0].quantity = 7;
  const second = order(2); second.concertDate = "2026-10-13";
  const before = JSON.stringify([first, second]);
  const rows = kitchenPdfRows([first, second]);
  assert.deepEqual(rows.filter(row => row.itemName === "كشري").map(row => [row.concertName, row.date, row.quantity]), [[second.concertName, "2026-10-13", 3], [first.concertName, "2026-10-15", 7]]);
  assert.equal(rows.length, 6); assert.equal(JSON.stringify([first, second]), before);
});
test("unknown, zero, decimal and saved notes remain accurate in the same row and escaped", () => {
  const first = order(1); first.concertName = '<script>unsafe</script>'; first.lines![0].quantity = null; first.lines![0].notes = "ملاحظة محفوظة"; first.lines![1].quantity = 0;
  const rows = kitchenPdfRows([first]);
  assert.equal(rows[0].quantity, null); assert.equal(rows[1].quantity, 0); assert.equal(rows[2].quantity, 0.1);
  assert.match(rows[0].note1, /ملاحظة محفوظة.*الكمية غير محددة/); assert.equal(rows[0].note2, "");
  const html = buildKitchenSummaryPdfHtml([first], filters, "");
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;")); assert.ok(!html.includes("<script>")); assert.ok(html.includes("غير محدد"));
  assert.equal(kitchenConcertName({ concertName: "   ", clientName: "عميل بديل" }), "عميل بديل");
});
