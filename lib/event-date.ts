/** تحويل قيم التاريخ المستخدمة في Firestore والنماذج إلى YYYY-MM-DD محلي. */
export function eventDateString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.substring(0, 10);
  const objectValue = value as Record<string, unknown>;
  const asLocalDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
