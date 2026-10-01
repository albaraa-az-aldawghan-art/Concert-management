import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { RECIPE_COLUMNS } from "./export-columns";
import { appendRecipeGroups } from "./recipe-export-layout";

test("recipe export groups ingredients, merges the recipe name and separates recipes", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("الوصفات القياسية");
  ws.addRow(["العنوان"]);
  ws.addRow(["2 وصفة"]);
  ws.addRow(RECIPE_COLUMNS.map((column) => column.label));

  appendRecipeGroups(ws, RECIPE_COLUMNS, [
    { rows: [
      { product: "خلطة حمص", productBarcode: "P1", productUnit: "كجم", ingredient: "حمص", quantity: 10 },
      { product: "خلطة حمص", productBarcode: "P1", productUnit: "كجم", ingredient: "طحينة", quantity: 2 },
    ] },
    { rows: [
      { product: "تبولة", productBarcode: "P2", productUnit: "كجم", ingredient: "بقدونس", quantity: 5 },
    ] },
  ]);

  assert.equal(ws.getCell("A4").value, "خلطة حمص");
  assert.equal(ws.getCell("A5").isMerged, true);
  assert.equal(ws.getCell("A6").value, "-");
  assert.equal(ws.getCell("A7").value, "تبولة");
  assert.equal(ws.getCell("D4").value, "حمص");
  assert.equal(ws.getCell("D5").value, "طحينة");
  assert.equal(ws.getCell("D7").value, "بقدونس");
  const firstFill = ws.getCell("G4").fill;
  const secondFill = ws.getCell("G7").fill;
  assert.equal(firstFill.type, "pattern");
  assert.equal(firstFill.type === "pattern" && firstFill.fgColor?.argb, "FFFFE699");
  assert.equal(secondFill.type === "pattern" && secondFill.fgColor?.argb, "FFFFE699");

  // تحقق من بقاء الدمج والتنسيق بعد إنشاء ملف XLSX وفتحه من جديد.
  const saved = await wb.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(saved as ExcelJS.Buffer);
  const reopenedSheet = reopened.getWorksheet("الوصفات القياسية")!;
  assert.equal(reopenedSheet.getCell("A5").isMerged, true);
  assert.equal(reopenedSheet.getCell("A6").value, "-");
  const reopenedFill = reopenedSheet.getCell("G4").fill;
  assert.equal(reopenedFill.type === "pattern" && reopenedFill.fgColor?.argb, "FFFFE699");
});

test("recipe grouping still works when optional columns are not exported", () => {
  const columns = RECIPE_COLUMNS.filter((column) => ["product", "ingredient", "quantity"].includes(column.key));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("مختصر");

  appendRecipeGroups(ws, columns, [{ rows: [
    { product: "خلطة", ingredient: "مكوّن 1", quantity: 1 },
    { product: "خلطة", ingredient: "مكوّن 2", quantity: 2 },
  ] }]);

  assert.equal(ws.getCell("A1").value, "خلطة");
  assert.equal(ws.getCell("A2").isMerged, true);
  assert.equal(ws.getCell("B2").value, "مكوّن 2");
  assert.equal(ws.getCell("C2").value, 2);
});
