import ExcelJS from "exceljs";
import { ExportColumn } from "@/lib/server/export-columns";

export type RecipeExportRow = Record<string, string | number>;

export interface RecipeExportGroup {
  rows: RecipeExportRow[];
}

const RECIPE_FILL = "FFFFE699";
const SEPARATOR_FILL = "FFFFF2CC";

function rowValues(columns: ExportColumn[], row: RecipeExportRow) {
  return columns.map((column) => row[column.key] ?? "");
}

/**
 * يكتب كل وصفة كمجموعة بصرية واحدة:
 * - اسم المنتج في خلية واحدة مدمجة، بلا تكرار.
 * - تظليل أصفر لكامل صفوف الوصفة.
 * - صف فاصل بعلامة ناقص بين الوصفات.
 */
export function appendRecipeGroups(
  ws: ExcelJS.Worksheet,
  columns: ExportColumn[],
  groups: RecipeExportGroup[],
) {
  const productColumn = columns.findIndex((column) => column.key === "product") + 1;

  groups.forEach((group, groupIndex) => {
    if (group.rows.length === 0) return;
    const firstRow = ws.rowCount + 1;

    group.rows.forEach((source, rowIndex) => {
      const row = { ...source };
      if (rowIndex > 0) row.product = "";
      const excelRow = ws.addRow(rowValues(columns, row));
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RECIPE_FILL } };
      });
    });

    const lastRow = ws.rowCount;
    if (productColumn > 0 && lastRow > firstRow) {
      ws.mergeCells(firstRow, productColumn, lastRow, productColumn);
      const nameCell = ws.getCell(firstRow, productColumn);
      nameCell.value = group.rows[0].product ?? "";
      nameCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }

    if (groupIndex < groups.length - 1) {
      const separator = ws.addRow(["-"]);
      ws.mergeCells(separator.number, 1, separator.number, columns.length);
      separator.height = 14;
      separator.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      separator.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
      separator.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SEPARATOR_FILL } };
    }
  });
}
