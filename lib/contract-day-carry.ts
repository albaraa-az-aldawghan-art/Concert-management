export interface CarryLine {
  barcode: string;
  remaining: number;
}

export interface CarryDay {
  date: string;
  lines: CarryLine[];
}

/**
 * رصيد بداية التاريخ المطلوب. يبدأ برصيد ما قبل الشهر، ثم يأخذ آخر
 * جرد مسجل داخل الشهر قبل التاريخ. الصنف الغائب من آخر جرد رصيده صفر.
 */
export function openingStockForDate(
  days: CarryDay[],
  date: string,
  monthOpening: Record<string, number>,
): Map<string, number> {
  const previous = days
    .filter((day) => day.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const source = previous
    ? Object.fromEntries(previous.lines.map((line) => [line.barcode, line.remaining]))
    : monthOpening;
  return new Map(Object.entries(source).map(([barcode, quantity]) => [barcode, Number(quantity) || 0]));
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
