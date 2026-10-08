import { toLatinDigits } from "./utils";

export function latinFieldValue(value: string) {
  return toLatinDigits(value).replace(/[\u066b\u060c,]/g, ".");
}
export function numericFieldError(value: string, min?: string | number, max?: string | number, step?: string | number) {
  if (!value) return "";
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) return "أدخل رقماً صحيحاً";
  const number = Number(value);
  if (min !== undefined && number < Number(min)) return `الحد الأدنى ${min}`;
  if (max !== undefined && number > Number(max)) return `الحد الأعلى ${max}`;
  const increment = step === "any" ? 0 : Number(step ?? 1);
  if (increment > 0) {
    const position = (number - Number(min ?? 0)) / increment;
    if (Math.abs(position - Math.round(position)) > 0.000001) return `استخدم مضاعفات ${increment}`;
  }
  return "";
}
export function validCalendarValue(value: string, type: "date" | "month" | "datetime-local" | "time", min?: string | number, max?: string | number) {
  if (!value) return true;
  const patterns = { date: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, "datetime-local": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, time: /^\d{2}:\d{2}(:\d{2})?$/ };
  if (!patterns[type].test(value)) return false;
  const raw = type === "time" ? `2000-01-01T${value}Z` : type === "datetime-local" ? `${value}Z` : `${value}${type === "month" ? "-01" : ""}T00:00:00Z`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const iso = date.toISOString();
  if ((type === "time" ? iso.slice(11, 11 + value.length) : iso.slice(0, value.length)) !== value) return false;
  return !(min && value < String(min)) && !(max && value > String(max));
}
