export interface CarryLine {
  barcode: string;
  remaining: number;
}

export interface CarryDay {
  date: string;
  lines: CarryLine[];
}

// الأصناف الثلاثة المعتمدة في كتالوج التعاقدات. الباركود ثابت ولو تغير الاسم.
const CARRY_BARCODES = new Set(["FRJ000109", "FRJ000038", "FRJ000661"]);
export function canCarryContractItem(barcode: string): boolean {
  return CARRY_BARCODES.has(barcode);
}

/** الترحيل التشغيلي مقصور على الماء والعصير والكينزا فقط. */
export function contractOpeningStockForDate(days: CarryDay[], date: string, monthOpening: Record<string, number>) {
  const opening = openingStockForDate(days, date, monthOpening);
  return new Map([...opening].map(([barcode, quantity]) => [barcode, canCarryContractItem(barcode) ? quantity : 0]));
}

/**
 * رصيد بداية التاريخ المطلوب لكل صنف، من أحدث جرد سابق له.
 * غياب الصنف لا يعني نفاده؛ الصفر الصريح وحده يصفر رصيده.
 */
export function openingStockForDate(
  days: CarryDay[],
  date: string,
  monthOpening: Record<string, number>,
): Map<string, number> {
  const previous = days
    .filter((day) => day.date < date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const opening = new Map(Object.entries(monthOpening).map(([barcode, quantity]) => [barcode, Number(quantity) || 0]));
  for (const day of previous) {
    for (const line of day.lines) opening.set(line.barcode, Number(line.remaining) || 0);
  }
  return opening;
}

/** تقدم يوم تقويمي واحد دون الاعتماد على توقيت الجهاز أو طول الشهر. */
export function nextContractDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) return "";
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** اليوم الجديد يبدأ فقط بالأصناف التي بقي منها رصيد، دون تسجيل بيع وهمي. */
export function carriedDayLines(order: string[], opening: Map<string, number>) {
  return order
    .filter((barcode) => (opening.get(barcode) ?? 0) > 0)
    .map((barcode) => ({
      barcode,
      supplied: "",
      damaged: "",
      remaining: String(opening.get(barcode)),
    }));
}
