import ExcelJS from "exceljs";
import type { CostIncoming, CostItem, SalesSection } from "@/types";
import {
  type ExportColumn,
  PRODUCT_COLUMNS,
  RAW_MATERIAL_COLUMNS,
  RECIPE_COLUMNS,
  pickColumns,
} from "@/lib/server/export-columns";
import { appendRecipeGroups } from "@/lib/server/recipe-export-layout";
import { productMainSectionLabel, productSubSectionLabel } from "@/lib/product-sections";

export type CostItemsExportScope = "raw" | "products" | "recipes";

export const COST_ITEMS_EXPORT_META: Record<CostItemsExportScope, { title: string; filename: string }> = {
  raw: { title: "المواد الخام", filename: "المواد الخام.xlsx" },
  products: { title: "المنتجات", filename: "المنتجات.xlsx" },
  recipes: { title: "الوصفات القياسية", filename: "الوصفات القياسية.xlsx" },
};

export interface CostItemsExportInput {
  scope: CostItemsExportScope;
  selectedColumns: string[] | string | null;
  items: CostItem[];
  incoming?: CostIncoming[];
  sections?: SalesSection[];
}

const formats: Record<string, string> = {
  money: '#,##0.00 "ريال"', int: "#,##0", pct: "0.0%", date: "dd/mm/yyyy",
};

function itemBalance(item: CostItem) {
  return Number(item.totalIn ?? 0) - Number(item.totalOut ?? 0);
}

function averageCost(item: CostItem) {
  const balance = itemBalance(item);
  return balance > 0 ? Number(item.totalInValue ?? 0) / balance : 0;
}

function itemKind(item: CostItem) {
  return item.kind ?? (Array.isArray(item.productionRecipe) && item.productionRecipe.length ? "produced" : "raw");
}

function selectedRaw(value: CostItemsExportInput["selectedColumns"]) {
  return Array.isArray(value) ? value.join(",") : value;
}

function prepareSheet(ws: ExcelJS.Worksheet, title: string, columns: ExportColumn[], rowCount: number) {
  ws.views = [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 3, topLeftCell: "A4", activeCell: "A1" }];
  ws.properties.defaultRowHeight = 20;
  ws.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  const titleRow = ws.addRow([title]);
  ws.mergeCells(1, 1, 1, columns.length);
  titleRow.font = { bold: true, size: 15, color: { argb: "FF1C2D50" } };
  titleRow.height = 25;
  const subtitle = ws.addRow([`${rowCount.toLocaleString("en-US")} سجل`]);
  ws.mergeCells(2, 1, 2, columns.length);
  subtitle.font = { size: 10, color: { argb: "FF64748B" } };
  const header = ws.addRow(columns.map((column) => column.label));
  header.font = { bold: true, color: { argb: "FF1C2D50" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F7" } };
  header.alignment = { horizontal: "right", vertical: "middle" };
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
}

function finishSheet(ws: ExcelJS.Worksheet, columns: ExportColumn[]) {
  ws.eachRow((row, rowNumber) => {
    row.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    if (rowNumber > 3) row.eachCell((cell, columnNumber) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      const format = columns[columnNumber - 1]?.fmt;
      if (format && formats[format]) cell.numFmt = formats[format];
    });
  });
}

function values(columns: ExportColumn[], row: Record<string, string | number>) {
  return columns.map((column) => row[column.key] ?? "");
}

export async function buildCostItemsWorkbook(input: CostItemsExportInput): Promise<ExcelJS.Workbook> {
  const { scope, items, incoming = [], sections = [] } = input;
  const meta = COST_ITEMS_EXPORT_META[scope];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام الفريج";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(meta.title);

  if (scope === "raw") {
    const supplierMap = new Map<string, Set<string>>();
    incoming.forEach((entry) => {
      const barcode = String(entry.itemBarcode ?? "");
      const supplier = String(entry.supplierName ?? "").trim();
      if (!barcode || !supplier) return;
      if (!supplierMap.has(barcode)) supplierMap.set(barcode, new Set());
      supplierMap.get(barcode)!.add(supplier);
    });
    const columns = pickColumns(RAW_MATERIAL_COLUMNS, selectedRaw(input.selectedColumns));
    const rows = items.filter((item) => itemKind(item) === "raw").map((item) => ({
      name: item.name ?? "", barcode: item.id, category: item.rawCategory ?? "غير مصنّف",
      suppliers: [...(supplierMap.get(item.id) ?? [])].join("، "), purchaseUnit: item.purchaseUnit ?? item.unit ?? "",
      unit: item.unit ?? "", conversion: Number(item.purchaseToIssue ?? 1),
      balance: itemBalance(item), minimum: Number(item.minimumStock ?? 0), average: averageCost(item),
      stockValue: itemBalance(item) * averageCost(item),
    }));
    prepareSheet(sheet, meta.title, columns, rows.length);
    rows.forEach((row) => sheet.addRow(values(columns, row)));
    finishSheet(sheet, columns);
  } else if (scope === "products") {
    const columns = pickColumns(PRODUCT_COLUMNS, selectedRaw(input.selectedColumns));
    const rows = items.filter((item) => itemKind(item) !== "raw").map((item) => {
      const recipe = Array.isArray(item.productionRecipe) ? item.productionRecipe : [];
      return {
        name: item.name ?? "", barcode: item.id, kind: itemKind(item) === "sale" ? "منتج بيع" : "منتج مصنّع",
        mainSection: productMainSectionLabel(item, sections), subSections: productSubSectionLabel(item, sections),
        unit: item.unit ?? "", balance: itemBalance(item), minimum: Number(item.minimumStock ?? 0),
        average: averageCost(item), stockValue: itemBalance(item) * averageCost(item),
        recipeStatus: recipe.length ? "مكتملة" : "تحتاج وصفة",
      };
    });
    prepareSheet(sheet, meta.title, columns, rows.length);
    rows.forEach((row) => sheet.addRow(values(columns, row)));
    finishSheet(sheet, columns);
  } else {
    const columns = pickColumns(RECIPE_COLUMNS, selectedRaw(input.selectedColumns));
    const groups = items.flatMap((item) => {
      const recipe = Array.isArray(item.productionRecipe) ? item.productionRecipe : [];
      if (recipe.length === 0) return [];
      return [{ rows: recipe.map((line) => ({
        product: item.name ?? "", productBarcode: item.id, productUnit: item.unit ?? "",
        ingredient: line.itemName ?? "", ingredientBarcode: line.barcode ?? "",
        ingredientUnit: line.unit ?? "", quantity: Number(line.qty ?? 0),
      })) }];
    });
    prepareSheet(sheet, meta.title, columns, groups.length);
    appendRecipeGroups(sheet, columns, groups);
    finishSheet(sheet, columns);
  }

  return workbook;
}

export async function costItemsWorkbookBlob(input: CostItemsExportInput): Promise<Blob> {
  const workbook = await buildCostItemsWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
