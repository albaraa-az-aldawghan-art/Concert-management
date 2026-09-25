import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireCaller, ApiError, withActivityResponse } from "@/lib/server/guard";

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

function prepareSheet(ws: ExcelJS.Worksheet, title: string, headers: string[]) {
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 2 }];
  const titleRow = ws.addRow([title]);
  ws.mergeCells(1, 1, 1, headers.length);
  titleRow.font = { bold: true, size: 15, color: { argb: "FF1C2D50" } };
  titleRow.height = 25;
  const header = ws.addRow(headers);
  header.font = { bold: true, color: { argb: "FF1C2D50" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F7" } };
  header.alignment = { horizontal: "right", vertical: "middle" };
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
}

function finishSheet(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((column) => { column.width = Math.min(40, Math.max(12, ...(column.values ?? []).map((v) => String(v ?? "").length + 2))); });
  ws.eachRow((row, rowNumber) => {
    row.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    if (rowNumber > 2) row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } }; });
  });
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
      prepareSheet(ws, meta.title, ["المادة", "الباركود", "القسم", "الموردون", "الوحدة", "الرصيد", "الحد الأدنى", "متوسط التكلفة", "قيمة الرصيد"]);
      items.filter((item) => kind(item) === "raw").forEach((item) => ws.addRow([
        item.name, item.id, item.rawCategory ?? "غير مصنّف", [...(supplierMap.get(item.id) ?? [])].join("، "), item.unit,
        balance(item), Number(item.minimumStock ?? 0), average(item), balance(item) * average(item),
      ]));
    } else if (scope === "products") {
      const sectionMap = new Map(sectionSnap?.docs.map((doc) => [doc.id, doc.data().name as string]) ?? []);
      prepareSheet(ws, meta.title, ["المنتج", "الباركود", "النوع", "القسم الأساسي", "الأقسام الفرعية", "الوحدة", "الرصيد", "الحد الأدنى", "متوسط التكلفة", "قيمة الرصيد", "حالة الوصفة"]);
      items.filter((item) => kind(item) !== "raw").forEach((item) => {
        const recipe = Array.isArray(item.productionRecipe) ? item.productionRecipe : [];
        const channel = item.salesChannel === "restaurant" ? "المطعم" : item.salesChannel === "concerts" ? "الحفلات" : item.salesChannel === "contracts" ? "التعاقدات" : "منتجات مصنعة";
        ws.addRow([item.name, item.id, kind(item) === "sale" ? "منتج بيع" : "منتج مصنع", channel,
          (Array.isArray(item.salesSections) ? item.salesSections : []).map((id) => sectionMap.get(String(id)) ?? id).join("، "), item.unit,
          balance(item), Number(item.minimumStock ?? 0), average(item), balance(item) * average(item), recipe.length ? "مكتملة" : "تحتاج وصفة"]);
      });
    } else {
      prepareSheet(ws, meta.title, ["المنتج", "باركود المنتج", "وحدة المنتج", "المكوّن", "باركود المكوّن", "وحدة المكوّن", "الكمية القياسية"]);
      items.filter((item) => Array.isArray(item.productionRecipe) && item.productionRecipe.length > 0).forEach((item) => {
        (item.productionRecipe as Record<string, unknown>[]).forEach((line) => ws.addRow([
          item.name, item.id, item.unit, line.itemName ?? line.name ?? "", line.barcode ?? "", line.unit ?? "", Number(line.qty ?? line.quantity ?? 0),
        ]));
      });
    }
    finishSheet(ws);
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
