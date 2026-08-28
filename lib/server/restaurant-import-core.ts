/* استيراد منصرف المطعم من ملف القالب المُعاد رفعه بعد تعبئته.
   ═══════════════════════════════════════════════════════════════
   كل صف بكمية موجبة يصير عملية منصرف مستقلة بقناة "restaurant" —
   صف بكمية فارغة أو صفر أو غير رقمية يُتجاهل بصمت بلا صرف له.
   الباركود هو مفتاح المطابقة الوحيد؛ صنف غير معروف يُسجَّل كخطأ في
   التقرير النهائي ولا يوقف باقي الصفوف — كل صف عملية مستقلة، فخطأ
   في صنف واحد (نفاد رصيده مثلاً) لا يمنع تسجيل بقية الملف. */

import ExcelJS from "exceljs";
import { Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { svcAddOutgoing } from "@/lib/server/costs-core";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RestaurantImportResult {
  created: number;
  skippedEmpty: number;
  errors: { row: number; barcode: string; message: string }[];
}

function cellNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    // خلية معادلة في إكسل: خذ ناتجها المحسوب لا الصيغة نفسها
    return cellNumber((v as { result: unknown }).result);
  }
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text ?? "").trim();
  }
  return String(v).trim();
}

export async function svcImportRestaurantDispense(
  db: Firestore,
  buffer: Buffer,
  d: { dispenseDate: string; departmentName: string; createdBy: string }
): Promise<RestaurantImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    // Buffer الأحدث من Node له خصائص لا يعرفها تعريف exceljs النوعي — لا خلاف فعلي في البيانات
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ApiError("تعذّرت قراءة الملف — تأكّد أنه ملف إكسل صحيح (xlsx)");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ApiError("الملف لا يحتوي أي ورقة عمل");

  // ابحث عن صف الرؤوس بمطابقة "الباركود" — لا نفترض رقم صف ثابت،
  // فالمستخدم قد يضيف صفوفاً أو يحذفها قبل الرفع
  let headerRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (headerRow !== -1) return;
    if (cellText(row.getCell(1).value) === "الباركود") headerRow = rowNumber;
  });
  if (headerRow === -1) {
    throw new ApiError('لم يُعثر على صف الرؤوس — تأكّد من عدم تعديل عمود "الباركود"');
  }

  const result: RestaurantImportResult = { created: 0, skippedEmpty: 0, errors: [] };

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const barcode = cellText(row.getCell(1).value);
    if (!barcode) continue; // نهاية البيانات

    const qty = cellNumber(row.getCell(4).value);
    if (qty == null || qty <= 0) { result.skippedEmpty++; continue; }

    try {
      const itemSnap = await db.collection("cost_items").doc(barcode).get();
      if (!itemSnap.exists) {
        result.errors.push({ row: r, barcode, message: "الباركود غير معروف — الصنف غير مسجَّل في أصناف التكاليف" });
        continue;
      }
      const item = itemSnap.data() as { totalIn?: number; totalOut?: number; totalInValue?: number };
      const balance = r2((item.totalIn ?? 0) - (item.totalOut ?? 0));
      const avgPrice = balance > 0 ? r2((item.totalInValue ?? 0) / balance) : 0;

      await svcAddOutgoing(db, {
        itemBarcode: barcode,
        quantity: qty,
        unitPrice: avgPrice,
        departmentName: d.departmentName,
        concertId: null, concertName: null, clientName: null, manualConcertName: null,
        contractId: null, contractName: null,
        channel: "restaurant",
        dispenseDate: d.dispenseDate,
        createdBy: d.createdBy,
      });
      result.created++;
    } catch (err) {
      result.errors.push({ row: r, barcode, message: err instanceof Error ? err.message : "خطأ غير متوقّع" });
    }
  }

  return result;
}
