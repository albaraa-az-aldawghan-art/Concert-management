import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchenSummaryPdfHtml, kitchenPdfRows } from "./kitchen-pdf";
import type { KitchenExportOrder } from "./kitchen-export";
const filters = { date: { mode: "custom" as const, from: "2026-10-01", to: "2026-10-31" }, search: "" };
const order = (id: number): KitchenExportOrder => ({ id: String(id), concertId: String(id), concertNumber: 900000 + id, concertName: `حفلة مسجلة (${id})`, clientName: "اسم العميل المختلف", concertDate: "2026-10-13", venueName: "قاعة لا يجب عرضها", status: "received", lines: [
  { name: "كشري", categoryName: "الأطباق الرئيسية", quantity: 3 },
  { name: "سلطة", categoryName: "المقبلات الباردة", quantity: 2 },
  { name: "حلى", categoryName: "الحلويات", quantity: 0.1 },
] });
test("PDF lists all event names above sections only, with no dates, venue or IDs", () => {
  const orders = Array.from({ length: 62 }, (_, index) => order(index));
  const html = buildKitchenSummaryPdfHtml(orders, filters, "");
  const [header, body] = html.split("</header>");
  assert.equal((html.match(/<table /g) ?? []).length, 3);
  for (const item of orders) {
    assert.ok(header.includes(item.concertName!)); assert.ok(!body.includes(item.concertName!));
    assert.ok(!html.includes(String(item.concertNumber)));
  }
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html));
  for (const unwanted of ["قاعة لا يجب عرضها", "تاريخ الحفلة", "اسم الحفلة</th>", "المكان"]) assert.ok(!html.includes(unwanted));
  assert.deepEqual([...html.matchAll(/<th>(.*?)<\/th>/g)].map(match => match[1]), Array(3).fill(["اسم الصنف", "العدد", "ملاحظات 1", "ملاحظات 2"]).flat());
  for (const [index, section] of [...html.matchAll(/<table [\s\S]*?<\/table>/g)].entries()) {
    assert.ok(section[0].includes(orders[0].lines![index].categoryName!));
    assert.ok(section[0].includes(orders[0].lines![index].name));
    assert.equal((section[0].match(/<tbody><tr>/g) ?? []).length, 1);
  }
});
test("combine within category only, preserving section order, decimals and source data", () => {
  const first = order(1), second = order(2); second.lines![0].quantity = 7;
  first.lines!.push({ name: "كشري", categoryName: "قسم آخر", quantity: 9 });
  const before = JSON.stringify([first, second]);
  const rows = kitchenPdfRows([first, second]);
  assert.deepEqual(rows.map(row => [row.category, row.itemName, row.quantity]), [["الأطباق الرئيسية", "كشري", 10], ["المقبلات الباردة", "سلطة", 4], ["الحلويات", "حلى", 0.2], ["قسم آخر", "كشري", 9]]);
  assert.equal(JSON.stringify([first, second]), before);
});
test("unknown and partial totals explicit; notes escaped; zero never missing", () => {
  const first = order(1), second = order(2);
  first.concertName = '<script>unsafe</script>'; first.lines![0].quantity = null; first.lines![0].notes = "ملاحظة محفوظة";
  first.lines![1].quantity = 0; second.lines![1].quantity = 0;
  let rows = kitchenPdfRows([first]);
  assert.equal(rows[0].quantity, null); assert.equal(rows[1].quantity, 0);
  assert.match(rows[0].note1, /ملاحظة محفوظة.*الكمية غير محددة/);
  rows = kitchenPdfRows([first, second]);
  assert.equal(rows[0].quantity, 3); assert.match(rows[0].note1, /مجموع جزئي/);
  assert.equal(rows[1].missing, 0); assert.equal(rows[1].quantity, 0); assert.equal(rows[0].note2, "");
  const html = buildKitchenSummaryPdfHtml([first, second], filters, "");
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;")); assert.ok(!html.includes("<script>"));
  assert.ok(!html.split("</header>")[1].includes("حفلة مسجلة"));
});
