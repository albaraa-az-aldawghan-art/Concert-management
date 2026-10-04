import ExcelJS from "exceljs";
import { ExportColumn } from "@/lib/server/export-columns";

export type RecipeExportRow = Record<string, string | number>;

export interface RecipeExportGroup {
  rows: RecipeExportRow[];
}

const RECIPE_FILL = "FFFFE699";
const PRODUCT_KEYS = new Set(["product", "productBarcode", "productUnit"]);

function rowValues(columns: ExportColumn[], row: RecipeExportRow) {
  return columns.map((column) => row[column.key] ?? "");
}

/** يكتب كل مكوّن في صف مستقل، مع إبقاء بيانات الخلطة خلية واحدة مدمجة رأسياً. */
export function appendRecipeGroups(
  ws: ExcelJS.Worksheet,
  columns: ExportColumn[],
  groups: RecipeExportGroup[],
) {
  groups.forEach((group) => {
    if (group.rows.length === 0) return;
    const firstRow = ws.rowCount + 1;
    group.rows.forEach((row) => {
      const excelRow = ws.addRow(rowValues(columns, row));
      const ingredientColumn = columns.findIndex((column) => column.key === "ingredient") + 1;
      if (ingredientColumn > 0) {
        excelRow.getCell(ingredientColumn).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RECIPE_FILL } };
      }
    });
    const lastRow = ws.rowCount;

    if (lastRow > firstRow) {
      columns.forEach((column, index) => {
        if (!PRODUCT_KEYS.has(column.key)) return;
        ws.mergeCells(firstRow, index + 1, lastRow, index + 1);
      });
    }

    const ingredientColumn = columns.findIndex((column) => column.key === "ingredient") + 1;
    if (ingredientColumn > 0) for (let row = firstRow; row <= lastRow; row += 1) {
      ws.getCell(row, ingredientColumn).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RECIPE_FILL } };
    }
  });
}
