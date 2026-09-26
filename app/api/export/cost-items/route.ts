import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireCaller, ApiError, withActivityResponse } from "@/lib/server/guard";
import {
  ExportColumn, PRODUCT_COLUMNS, RAW_MATERIAL_COLUMNS, RECIPE_COLUMNS, pickColumns,
} from "@/lib/server/export-columns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Scope = "raw" | "products" | "recipes";
type Doc = Record<string, unknown> & { id: string };

const scopeMeta: Record<Scope, { title: string; filename: string }> = {
  raw: { title: "المواد الخام", filename: "المواد الخام.xlsx" },
  products: { title: "المنتجات", filename: "المنتجات.xlsx" },
  recipes: { title: "الوصفات القياسية", filename: "الوصفات القياسية.xlsx" },
};

function balance(item: Doc) { return Number(item.totalIn ?? 0) - Number(item.totalOut ?? 0); }
function average(item: Doc) { const b = balance(item); return b > 0 ? Number(item.totalInValue ?? 0) / b : 0; }
function kind(item: Doc) { return item.kind ?? (Array.isArray(item.productionRecipe) && item.productionRecipe.length ? "produced" : "raw"); }

const formats: Record<string, string> = {
  money: '#,##0.00 "ريال"', int: "#,##0", pct: "0.0%", date: "dd/mm/yyyy",
};

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

async function download(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!caller.isAdmin && !caller.feat("costs", "export")) throw new ApiError("لا تملك صلاحية تصدير التكاليف", 403);
    const scope = new URL(req.url).searchParams.get("scope") as Scope;
    if (!scopeMeta[scope]) throw new ApiError("نوع التصدير غير صحيح");

    const [itemSnap, incomingSnap, sectionSnap] = await Promise.all([
      caller.db.collection("cost_items").get(),
      scope === "raw" ? caller.db.collection("cost_incoming").get() : Promise.resolve(null),
      scope === "products" ? caller.db.collection("sales_sections").get() : Promise.resolve(null),
    ]);
    const items: Doc[] = itemSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const wb = new ExcelJS.Workbook();
    wb.creator = "نظام الفريج";
    const meta = scopeMeta[scope];
    const ws = wb.addWorksheet(meta.title);

    if (scope === "raw") {
      const supplierMap = new Map<string, Set<string>>();
      incomingSnap?.docs.forEach((doc) => {
        const data = doc.data(); const barcode = String(data.itemBarcode ?? ""); const supplier = String(data.supplierName ?? "").trim();
        if (barcode && supplier) { if (!supplierMap.has(barcode)) supplierMap.set(barcode, new Set()); supplierMap.get(barcode)!.add(supplier); }
      });
      const columns = pickColumns(RAW_MATERIAL_COLUMNS, new URL(req.url).searchParams.get("cols"));
      const rows = items.filter((item) => kind(item) === "raw").map((item) => ({
        name: String(item.name ?? ""), barcode: item.id, category: String(item.rawCategory ?? "غير مصنّف"),
        suppliers: [...(supplierMap.get(item.id) ?? [])].join("، "), unit: String(item.unit ?? ""),
        balance: balance(item), minimum: Number(item.minimumStock ?? 0), average: average(item), stockValue: balance(item) * average(item),
      }));
      prepareSheet(ws, meta.title, columns, rows.length);
      rows.forEach((row) => ws.addRow(values(columns, row)));
      finishSheet(ws, columns);
    } else if (scope === "products") {
      const sectionMap = new Map(sectionSnap?.docs.map((doc) => [doc.id, doc.data().name as string]) ?? []);
      const columns = pickColumns(PRODUCT_COLUMNS, new URL(req.url).searchParams.get("cols"));
      const rows = items.filter((item) => kind(item) !== "raw").map((item) => {
        const recipe = Array.isArray(item.productionRecipe) ? item.productionRecipe : [];
        const channel = item.salesChannel === "restaurant" ? "المطعم" : item.salesChannel === "concerts" ? "الحفلات" : item.salesChannel === "contracts" ? "التعاقدات" : "منتجات مصنعة";
        return {
          name: String(item.name ?? ""), barcode: item.id, kind: kind(item) === "sale" ? "منتج بيع" : "منتج مصنع", mainSection: channel,
          subSections: (Array.isArray(item.salesSections) ? item.salesSections : []).map((id) => sectionMap.get(String(id)) ?? String(id)).join("، "),
          unit: String(item.unit ?? ""), balance: balance(item), minimum: Number(item.minimumStock ?? 0), average: average(item),
          stockValue: balance(item) * average(item), recipeStatus: recipe.length ? "مكتملة" : "تحتاج وصفة",
        };
      });
      prepareSheet(ws, meta.title, columns, rows.length);
      rows.forEach((row) => ws.addRow(values(columns, row)));
      finishSheet(ws, columns);
    } else {
      const columns = pickColumns(RECIPE_COLUMNS, new URL(req.url).searchParams.get("cols"));
      const rows = items.flatMap((item) => Array.isArray(item.productionRecipe) ? (item.productionRecipe as Record<string, unknown>[]).map((line) => ({
        product: String(item.name ?? ""), productBarcode: item.id, productUnit: String(item.unit ?? ""),
        ingredient: String(line.itemName ?? line.name ?? ""), ingredientBarcode: String(line.barcode ?? ""),
        ingredientUnit: String(line.unit ?? ""), quantity: Number(line.qty ?? line.quantity ?? 0),
      })) : []);
      prepareSheet(ws, meta.title, columns, rows.length);
      rows.forEach((row) => ws.addRow(values(columns, row)));
      finishSheet(ws, columns);
    }
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cost-items-${scope}.xlsx"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
      "Cache-Control": "no-store, max-age=0",
    } });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}

export async function GET(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}
