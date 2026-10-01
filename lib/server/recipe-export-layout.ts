import ExcelJS from "exceljs";
import { ExportColumn } from "@/lib/server/export-columns";

export type RecipeExportRow = Record<string, string | number>;

export interface RecipeExportGroup {
  rows: RecipeExportRow[];
}

const RECIPE_FILL = "FFFFE699";
const JOINER = " - ";

function rowValues(columns: ExportColumn[], row: RecipeExportRow) {
  return columns.map((column) => row[column.key] ?? "");
}

/** يكتب كل وصفة في صف واحد، ويفصل قيم مكوّناتها بشرطة داخل كل عمود. */
export function appendRecipeGroups(
  ws: ExcelJS.Worksheet,
  columns: ExportColumn[],
  groups: RecipeExportGroup[],
) {
  groups.forEach((group) => {
    if (group.rows.length === 0) return;
    const first = group.rows[0];
    const combined: RecipeExportRow = {
      product: first.product ?? "",
      productBarcode: first.productBarcode ?? "",
      productUnit: first.productUnit ?? "",
      ingredient: group.rows.map((row) => String(row.ingredient ?? "")).join(JOINER),
      ingredientBarcode: group.rows.map((row) => String(row.ingredientBarcode ?? "")).join(JOINER),
      ingredientUnit: group.rows.map((row) => String(row.ingredientUnit ?? "")).join(JOINER),
      quantity: group.rows.map((row) => String(row.quantity ?? "")).join(JOINER),
    };
    const excelRow = ws.addRow(rowValues(columns, combined));
    const ingredientColumn = columns.findIndex((column) => column.key === "ingredient") + 1;
    if (ingredientColumn > 0) {
      const ingredientCell = excelRow.getCell(ingredientColumn);
      ingredientCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RECIPE_FILL } };
    }
  });
}
