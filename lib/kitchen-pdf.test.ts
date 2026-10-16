import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchenSummaryPdfHtml } from "./kitchen-pdf";
import { aggregateKitchenOrders, kitchenConcertName, type KitchenExportOrder } from "./kitchen-export";
const filters = { date: { mode: "custom" as const, from: "2026-10-01", to: "2026-10-31" }, search: "حفلات" };
const order = (id: number): KitchenExportOrder => ({ id: String(id), concertId: String(id), concertNumber: 900000 + id, concertName: `حفلة مسجلة ${id}`, clientName: "اسم العميل المختلف", concertDate: "2026-10-13", venueName: "قاعة الاختبار", status: "received", lines: [
  { name: "كشري", categoryName: "الأطباق الرئيسية", quantity: 3 },
  { name: "سلطة", categoryName: "المقبلات", quantity: 2 },
  { name: "حلى", categoryName: "الحلويات", quantity: 0.1 },
] });
test("PDF uses all concert names, groups sections and preserves exact quantities", () => {
  const orders = Array.from({ length: 35 }, (_, index) => order(index));
  const html = buildKitchenSummaryPdfHtml(orders, filters, "", new Date("2026-10-16T12:00:00Z"));
  for (const item of orders) { assert.ok(html.includes(item.concertName!)); assert.ok(!html.includes(String(item.concertNumber))); }
  for (const section of ["الأطباق الرئيسية", "المقبلات", "الحلويات"]) assert.ok(html.includes(`class="category-heading">${section}`));
  assert.ok(html.indexOf('class="category-heading">الأطباق الرئيسية') < html.indexOf('class="category-heading">المقبلات'));
  assert.ok(html.indexOf('class="category-heading">المقبلات') < html.indexOf('class="category-heading">الحلويات'));
  assert.ok(html.includes("2026-10-01")); assert.ok(html.includes("2026-10-31"));
  const quantities = new Map(aggregateKitchenOrders(orders).map(row => [row.name, row.quantity]));
  assert.equal(quantities.get("كشري"), 105); assert.equal(quantities.get("سلطة"), 70); assert.equal(quantities.get("حلى"), 3.5);
});
test("PDF reports unknown quantities by concert name, never converts missing to zero, and escapes text", () => {
  const first = order(1); first.concertName = '<script>unsafe</script>'; first.lines![0].quantity = null;
  const second = order(2);
  const rows = aggregateKitchenOrders([first, second]);
  assert.equal(rows.find(row => row.name === "كشري")?.quantity, 3);
  assert.ok(rows.find(row => row.name === "كشري")?.missingConcertNames[0].includes(first.concertName));
  const html = buildKitchenSummaryPdfHtml([first, second], filters, "");
  assert.ok(html.includes("مجموع جزئي")); assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;")); assert.ok(!html.includes("<script>"));
  first.lines = [{ name: "مياه", quantity: null }];
  assert.ok(buildKitchenSummaryPdfHtml([first], filters, "").includes("غير محدد"));
  assert.equal(kitchenConcertName({ concertName: "   ", clientName: "عميل بديل" }), "عميل بديل");
});
