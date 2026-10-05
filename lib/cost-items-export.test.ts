import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import type { CostIncoming, CostItem, SalesSection } from "@/types";
import { buildCostItemsWorkbook } from "@/lib/cost-items-export";

const raw = {
  id: "RAW001", name: "أرز", kind: "raw", unit: "جم", purchaseUnit: "كيس",
  purchaseToIssue: 25_000, rawCategory: "حبوب", totalIn: 30_000, totalOut: 5_000,
  totalInValue: 2_500, minimumStock: 1_000,
} as unknown as CostItem;

const sale = {
  id: "PRD001", name: "وجبة أرز", kind: "sale", unit: "حبة", salesChannel: "restaurant",
  salesSections: ["meals"], totalIn: 12, totalOut: 2, totalInValue: 200, minimumStock: 3,
  productionRecipe: [
    { barcode: "RAW001", itemName: "أرز", unit: "جم", qty: 150 },
    { barcode: "RAW002", itemName: "ملح", unit: "جم", qty: 5 },
  ],
} as unknown as CostItem;

const incoming = [{ itemBarcode: "RAW001", supplierName: "المورد الأول" }] as CostIncoming[];
const sections = [{ id: "meals", name: "الوجبات", channel: "restaurant" }] as SalesSection[];

async function reopen(workbook: ExcelJS.Workbook) {
  const bytes = await workbook.xlsx.writeBuffer();
  assert.ok(bytes.byteLength > 1_000, "يجب أن يكون ملف XLSX حقيقياً وغير فارغ");
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes as ExcelJS.Buffer);
  return reopened;
}

test("تصدير المواد الخام يحافظ على المورد والوحدات والأرصدة", async () => {
  const workbook = await buildCostItemsWorkbook({
    scope: "raw",
    selectedColumns: ["name", "barcode", "suppliers", "purchaseUnit", "unit", "conversion", "balance", "minimum", "average", "stockValue"],
    items: [raw, sale], incoming,
  });
  const reopened = await reopen(workbook);
  const sheet = reopened.worksheets[0];
  assert.equal(sheet.rowCount, 4);
  assert.deepEqual(sheet.getRow(4).values.slice(1), [
    "أرز", "RAW001", "المورد الأول", "كيس", "جم", 25_000, 25_000, 1_000, 0.1, 2_500,
  ]);
});

test("تصدير المنتجات يخرج المنتج فقط مع القسم الصحيح", async () => {
  const workbook = await buildCostItemsWorkbook({
    scope: "products",
    selectedColumns: ["name", "barcode", "kind", "mainSection", "subSections", "balance", "recipeStatus"],
    items: [raw, sale], sections,
  });
  const reopened = await reopen(workbook);
  const sheet = reopened.worksheets[0];
  assert.equal(sheet.rowCount, 4);
  assert.deepEqual(sheet.getRow(4).values.slice(1), [
    "وجبة أرز", "PRD001", "منتج بيع", "المطعم", "الوجبات", 10, "مكتملة",
  ]);
});

test("تصدير الوصفات يفصل كل مكوّن في صف ويبقي المنتج خلطة واحدة", async () => {
  const workbook = await buildCostItemsWorkbook({
    scope: "recipes",
    selectedColumns: ["product", "productBarcode", "productUnit", "ingredient", "ingredientBarcode", "ingredientUnit", "quantity"],
    items: [raw, sale],
  });
  const reopened = await reopen(workbook);
  const sheet = reopened.worksheets[0];
  assert.equal(sheet.rowCount, 5);
  assert.equal(sheet.getCell("A4").value, "وجبة أرز");
  assert.equal(sheet.getCell("D4").value, "أرز");
  assert.equal(sheet.getCell("G4").value, 150);
  assert.equal(sheet.getCell("D5").value, "ملح");
  assert.equal(sheet.getCell("G5").value, 5);
  assert.ok(sheet.getCell("A4").isMerged);
  assert.ok(sheet.getCell("A5").isMerged);
});
