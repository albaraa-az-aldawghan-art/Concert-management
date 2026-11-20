import { toLatinDigits } from "./utils";

export const PURCHASE_ORDER_NUMBER_MAX_LENGTH = 100;

export function normalizePurchaseOrderNumber(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("أدخل رقم أمر الشراء كنص");
  const number = toLatinDigits(value.trim());
  if (number.length > PURCHASE_ORDER_NUMBER_MAX_LENGTH || /[\r\n]/.test(number)) {
    throw new Error(`رقم أمر الشراء يكون في سطر واحد وبحد أقصى ${PURCHASE_ORDER_NUMBER_MAX_LENGTH} حرف`);
  }
  return number || null;
}
