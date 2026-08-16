/* كتالوج أعمدة التصدير: مصدر واحد يقرؤه الخادم (لبناء الملف) والواجهة
   (لبناء قائمة الاختيار) — فلا يختلف عمود بين الاثنين أبداً. */

export interface ExportColumn {
  /** مفتاح مختصر يُمرَّر في الرابط — قصير كي يبقى الرابط قابلاً للنسخ */
  key: string;
  label: string;
  /** عرض العمود في إكسل بالحروف */
  width: number;
  /** تنسيق الرقم: مبلغ بالريال، أو عدد صحيح، أو نسبة مئوية */
  fmt?: "money" | "int" | "pct" | "date";
  /** مضمَّن افتراضياً في أول تصدير */
  default?: boolean;
}

/* ── أعمدة المبيعات (الحفلات) ── */
export const SALES_COLUMNS: ExportColumn[] = [
  { key: "no",        label: "رقم الحفلة",            width: 11, fmt: "int",   default: true },
  { key: "name",      label: "اسم الحفلة",            width: 22, default: true },
  { key: "date",      label: "التاريخ",               width: 12, fmt: "date",  default: true },
  { key: "weekday",   label: "اليوم",                 width: 10 },
  { key: "client",    label: "العميل",                width: 18, default: true },
  { key: "phone",     label: "الجوال",                width: 14 },
  { key: "phone2",    label: "جوال إضافي",            width: 14 },
  { key: "venue",     label: "المكان",                width: 18, default: true },
  { key: "people",    label: "عدد الأشخاص",           width: 14 },
  { key: "status",    label: "الحالة",                width: 12, default: true },
  { key: "price",     label: "السعر شامل الضريبة",    width: 18, fmt: "money", default: true },
  { key: "vat",       label: "الضريبة",               width: 13, fmt: "money" },
  { key: "net",       label: "الصافي قبل الضريبة",    width: 18, fmt: "money", default: true },
  { key: "paid",      label: "المحصَّل",               width: 14, fmt: "money", default: true },
  { key: "due",       label: "المتبقي",               width: 14, fmt: "money", default: true },
  { key: "payCount",  label: "عدد الدفعات",           width: 12, fmt: "int" },
  { key: "lastPay",   label: "آخر دفعة",              width: 12, fmt: "date" },
  /* تفاصيل الدفعات — كل دفعة سطر داخل الخلية، فيبقى صف الحفلة واحداً */
  { key: "payMethods",  label: "وسائل الدفع",            width: 18 },
  { key: "payDates",    label: "تواريخ الدفعات",         width: 18, },
  { key: "payAmounts",  label: "مبالغ الدفعات",          width: 18 },
  { key: "payBanks",    label: "البنك / نوع الشبكة",     width: 20 },
  { key: "paySenders",  label: "المحوِّل / المستلم",      width: 20 },
  /* الفاتورة للحفلة لا للدفعة — عمودٌ للرقم وآخر لحالته بدل قائمة
     أرقامٍ كانت تجمع فاتورةً لكل دفعة على عملٍ واحد */
  { key: "invoiceNo",     label: "رقم الفاتورة",           width: 16, default: true },
  { key: "invoiceStatus", label: "حالة الفاتورة",          width: 16 },
  { key: "payDetails",  label: "تفاصيل الدفعات كاملة",   width: 46 },
  { key: "hall",      label: "تكلفة القاعة",          width: 14, fmt: "money" },
  { key: "raw",       label: "خامات التكاليف",        width: 15, fmt: "money", default: true },
  { key: "external",  label: "مواد الموارد الخارجية", width: 18, fmt: "money" },
  { key: "internal",  label: "قيمة المواد الداخلية",  width: 18, fmt: "money" },
  { key: "transport", label: "النقل",                 width: 12, fmt: "money" },
  { key: "labor",     label: "العمالة",               width: 12, fmt: "money" },
  { key: "otherExp",  label: "مصروفات أخرى",          width: 14, fmt: "money" },
  { key: "costs",     label: "إجمالي التكاليف",       width: 16, fmt: "money", default: true },
  { key: "profit",    label: "الربح",                 width: 14, fmt: "money", default: true },
  { key: "margin",    label: "هامش الربح",            width: 12, fmt: "pct" },
  { key: "sups",      label: "المشرفون",              width: 20 },
  { key: "emps",      label: "الموظفون",              width: 20 },
  { key: "food",      label: "أصناف الأكل",           width: 30 },
  { key: "notes",     label: "ملاحظات",               width: 24 },
  { key: "refund",    label: "المسترد",               width: 12, fmt: "money" },
  { key: "cancelWhy", label: "سبب الإلغاء",           width: 20 },
];

/* ── أعمدة حركات التكاليف ── */
export const COSTS_COLUMNS: ExportColumn[] = [
  { key: "date",     label: "التاريخ",        width: 12, fmt: "date", default: true },
  { key: "kind",     label: "نوع الحركة",     width: 12, default: true },
  { key: "item",     label: "الصنف",          width: 24, default: true },
  { key: "barcode",  label: "الباركود",       width: 14, default: true },
  { key: "unit",     label: "الوحدة",         width: 10, default: true },
  { key: "qty",      label: "الكمية",         width: 11, default: true },
  { key: "price",    label: "سعر الوحدة",     width: 13, fmt: "money", default: true },
  { key: "total",    label: "الإجمالي",       width: 14, fmt: "money", default: true },
  { key: "party",    label: "المورد / القسم", width: 20, default: true },
  { key: "channel",  label: "الوجهة",         width: 12, default: true },
  { key: "client",   label: "العميل / الحفلة", width: 20, default: true },
  { key: "returned", label: "المرتجع",        width: 11 },
  { key: "damaged",  label: "التالف",         width: 11 },
  { key: "note",     label: "ملاحظة",         width: 28 },
];

/** أعمدة لقطة الأرصدة آخر كل شهر — ثابتة، لا تُختار */
export const BALANCE_COLUMNS: { label: string; width: number; fmt?: "money" | "int" }[] = [
  { label: "الصنف", width: 24 },
  { label: "الباركود", width: 14 },
  { label: "الوحدة", width: 10 },
  { label: "وارد تراكمي", width: 13 },
  { label: "منصرف تراكمي", width: 14 },
  { label: "الرصيد", width: 12 },
  { label: "قيمة الرصيد", width: 14, fmt: "money" },
  { label: "متوسط السعر", width: 13, fmt: "money" },
];

export function defaultKeys(cols: ExportColumn[]): string[] {
  return cols.filter((c) => c.default).map((c) => c.key);
}

/** يحوّل نص الرابط (a,b,c) إلى أعمدة صالحة بترتيب الكتالوج لا بترتيب
 *  ما كُتب — فيبقى شكل الملف ثابتاً مهما اختلف ترتيب الاختيار. */
export function pickColumns(cols: ExportColumn[], raw: string | null): ExportColumn[] {
  if (!raw) return cols.filter((c) => c.default);
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const picked = cols.filter((c) => wanted.has(c.key));
  return picked.length ? picked : cols.filter((c) => c.default);
}
