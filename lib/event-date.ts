/** يوم الرياض، مستقل عن لغة الجهاز والمنطقة الزمنية للمتصفح أو الخادم. */
export function riyadhDateString(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** تحويل قيم التاريخ المستخدمة في Firestore والنماذج إلى YYYY-MM-DD بتوقيت الرياض. */
export function eventDateString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    // Date-only/local form values keep their calendar day; absolute timestamps use Riyadh.
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return riyadhDateString(new Date(value));
    return value.substring(0, 10);
  }
  if (value instanceof Date) return riyadhDateString(value);
  const objectValue = value as Record<string, unknown>;
  const asLocalDate = riyadhDateString;
  if (typeof objectValue.toDate === "function") {
    return asLocalDate((objectValue as { toDate: () => Date }).toDate());
  }
  if (typeof objectValue.seconds === "number") {
    return asLocalDate(new Date((objectValue as { seconds: number }).seconds * 1000));
  }
  return "";
}

/** ترتيب موحّد لقوائم الحفلات: التاريخ الأقدم أولاً، والقيم الفارغة في النهاية. */
export function compareEventDates(a: unknown, b: unknown): number {
  const first = eventDateString(a);
  const second = eventDateString(b);
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second);
}
