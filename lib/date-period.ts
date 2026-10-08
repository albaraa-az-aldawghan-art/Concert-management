import { eventDateString, riyadhDateString } from "./event-date";

export type DateMode = "all" | "today" | "week" | "next-week" | "month" | "custom";
export interface DateFilterState { mode: DateMode; from: string; to: string }
export const DATE_PERIOD_OPTIONS: { key: DateMode; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "today", label: "اليوم" },
  { key: "week", label: "هذا الأسبوع" }, { key: "next-week", label: "الأسبوع القادم" },
  { key: "month", label: "هذا الشهر" }, { key: "custom", label: "نطاق مخصص" },
];

/** The calendar week is Sunday through Saturday, including across months/years. */
export function getWeekBounds(now = new Date(), offset = 0): [string, string] {
  const start = new Date(`${riyadhDateString(now)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + offset * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
export function getMonthBounds(now = new Date()): [string, string] {
  const date = new Date(`${riyadhDateString(now)}T00:00:00Z`);
  return [new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)];
}
export function periodBounds(mode: DateMode, now = new Date()): [string, string] {
  if (mode === "week" || mode === "next-week") return getWeekBounds(now, mode === "next-week" ? 1 : 0);
  if (mode === "month") return getMonthBounds(now);
  if (mode === "today") { const day = riyadhDateString(now); return [day, day]; }
  return ["", ""];
}
export function matchesDate(value: unknown, filter: DateFilterState, now = new Date()): boolean {
  if (filter.mode === "all") return true;
  const date = eventDateString(value);
  if (!date) return false;
  const [from, to] = filter.mode === "custom" ? [filter.from, filter.to] : periodBounds(filter.mode, now);
  return (!from || date >= from) && (!to || date <= to);
}
