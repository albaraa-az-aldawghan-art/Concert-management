import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { styleCancelledConcertRow } from "./export-core";

test("cancelled concert Excel rows are red across every exported column", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الحفلات");
  const row = sheet.addRow([12, "حفلة ملغاة", "ملغاة", 5000]);
  styleCancelledConcertRow(row, 4, 3);

  for (let column = 1; column <= 4; column++) {
    assert.equal(row.getCell(column).fill.type, "pattern");
    if (row.getCell(column).fill.type === "pattern") {
      assert.equal(row.getCell(column).fill.fgColor?.argb, "FFFEE2E2");
    }
    assert.equal(row.getCell(column).font.color?.argb, column === 3 ? "FF991B1B" : "FFB91C1C");
  }
  assert.equal(row.getCell(3).font.bold, true);
});
