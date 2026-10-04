/* هوية عميل الحفلات: الجوال هو مفتاح المطابقة للسجلات القديمة، ثم يُثبَّت
   customerId على الحفلة كي لا ينفصل تاريخ العميل إذا غيّر رقمه لاحقاً. */

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeCustomerPhone(value: unknown): string {
  let digits = String(value ?? "")
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith("5")) digits = `0${digits}`;
  return digits;
}

export function concertCustomerId(phone: unknown, concertId?: string): string {
  const normalized = normalizeCustomerPhone(phone);
  return normalized ? `phone_${normalized}` : `concert_${concertId ?? "unknown"}`;
}

