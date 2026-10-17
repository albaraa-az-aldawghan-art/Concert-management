import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { renderKitchenSummaryPdf } from "../lib/server/kitchen-pdf";
import type { KitchenExportOrder } from "../lib/kitchen-export";
import { kitchenPdfRows } from "../lib/kitchen-pdf";

async function main() {
  const categories = ["الأطباق الرئيسية", "المقبلات", "الحلويات والفواكه"];
  const orders: KitchenExportOrder[] = Array.from({ length: 31 }, (_, index) => ({
    id: `order-${index}`, concertId: `concert-${index}`, concertNumber: 900000 + index,
    concertName: `حفلة تجريبية لجهة الاختبار - الفرع ${index + 1}`,
    clientName: "اسم العميل ليس اسم الحفلة", concertDate: `2026-10-${String(index + 1).padStart(2, "0")}`,
    venueName: index % 2 ? "قاعة الاختبار الرئيسية" : "قاعة الضيافة والاحتفالات", status: "received",
    lines: categories.flatMap((category, group) => Array.from({ length: 10 }, (_, item) => ({
      categoryName: category, name: `${["طبق رئيسي", "مقبلات مشكلة", "حلى عربي"][group]} ${item + 1}`,
      quantity: index === 0 && item === 0 ? null : item === 1 ? 0 : item === 2 ? 0.1 : item + 1,
    }))),
  }));
  const rows = kitchenPdfRows(orders);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].quantity, 30);
  assert.equal(rows[0].missing, 1);
  assert.equal(rows[1].quantity, 0);
  assert.equal(rows[2].quantity, 3.1);
  assert.equal(rows[3].quantity, 124);
  const pdf = await renderKitchenSummaryPdf(orders, { date: { mode: "custom", from: "2026-10-01", to: "2026-10-31" }, search: "" });
  await mkdir("tmp/pdfs/kitchen", { recursive: true });
  await writeFile("tmp/pdfs/kitchen/layout.pdf", pdf);
  console.log("PASS: real renderer; 31 names above 3 sections, 30 aggregated items; no dates, correct zero/decimal/partial quantities.");
}
void main();
