import { Timestamp } from "firebase/firestore";
import { Concert } from "@/types";

/** الحالات الأربع المعتمدة. تبقى معرّفة هنا حتى تُضيَّق ConcertStatus
 *  في types/index.ts لاحقاً، فيبقى هذا الملف صالحاً قبل وبعد. */
export type ConcertStatus4 = "planned" | "confirmed" | "completed" | "cancelled";

/* ═══════════════════════════════════════════════════════════════
   حالات الحفلة — المصدر الوحيد للأسماء والألوان والترتيب.
   قبل هذا الملف كانت الأسماء مكرّرة في ٥ أماكن بمفردات مختلفة،
   وكانت الحفلة الملغاة تظهر بشارة فارغة لأن بعض النسخ لا تعرفها.

   القيم المخزّنة لم تتغيّر: أربع قيم كانت موجودة أصلاً في قاعدة
   البيانات. الحالات السبع الوسيطة القديمة تُترجَم عند القراءة عبر
   normalizeStatus حتى لا تنكسر أي حفلة قائمة قبل الترحيل أو بعده.
   ═══════════════════════════════════════════════════════════════ */

export const CONCERT_STATUS = {
  UNCONFIRMED: "planned",   // غير مؤكدة — لم تُسجَّل أي دفعة بعد
  CONFIRMED:   "confirmed", // مؤكدة — سُجّلت أول دفعة
  COMPLETED:   "completed", // مكتملة — تمت التسوية المالية
  CANCELLED:   "cancelled", // ملغاة
} as const;

export const STATUS_LABEL: Record<ConcertStatus4, string> = {
  planned:   "غير مؤكدة",
  confirmed: "مؤكدة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

// ألوان النص للقوائم والجداول
export const STATUS_COLOR: Record<ConcertStatus4, string> = {
  planned:   "text-yellow-600 bg-yellow-50",
  confirmed: "text-green-700 bg-green-50",
  completed: "text-slate-600 bg-slate-100",
  cancelled: "text-red-600 bg-red-50",
};

export type StatusBadgeVariant = "blue" | "green" | "red" | "yellow" | "gray" | "indigo" | "orange";

export const STATUS_VARIANT: Record<ConcertStatus4, StatusBadgeVariant> = {
  planned:   "yellow",
  confirmed: "green",
  completed: "gray",
  cancelled: "red",
};

// شرائح الفلترة — تُستخدم في كل صفحات القوائم بدل خمس قوائم متضاربة
export const STATUS_FILTERS: { key: ConcertStatus4 | "all"; label: string }[] = [
  { key: "all",       label: "الكل" },
  { key: "planned",   label: STATUS_LABEL.planned },
  { key: "confirmed", label: STATUS_LABEL.confirmed },
  { key: "completed", label: STATUS_LABEL.completed },
  { key: "cancelled", label: STATUS_LABEL.cancelled },
];

// الحالات الوسيطة القديمة → «مؤكدة». يبقى هذا دائماً كشبكة أمان
// للمستندات المستعادة من نسخة احتياطية أو التي فاتها الترحيل.
const LEGACY_TO_NEW: Record<string, ConcertStatus4> = {
  materials_requested:    "confirmed",
  active:                 "confirmed",
  location_set:           "confirmed",
  executing:              "confirmed",
  materials_returned:     "confirmed",
  delivered_to_warehouse: "confirmed",
  warehouse_confirmed:    "confirmed",
};

export function normalizeStatus(status: string | null | undefined): ConcertStatus4 {
  if (!status) return "planned";
  if (status in STATUS_LABEL) return status as ConcertStatus4;
  return LEGACY_TO_NEW[status] ?? "planned";
}

export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABEL[normalizeStatus(status)];
}

export function statusColor(status: string | null | undefined): string {
  return STATUS_COLOR[normalizeStatus(status)];
}

/* ── مراحل التشغيل (خطوات المشرف الخمس) ──────────────────────
   لم تعد حالات منفصلة للحفلة، بل تُشتق من العلامات المنطقية
   المحفوظة أصلاً. تُعرض كسطر ثانوي في القوائم وكقائمة إنجاز في
   صفحة الحفلة، فلا تضيع المعلومة التي كانت المراحل الإحدى عشرة
   تنقلها.                                                      */

export const OPERATIONAL_STEPS = [
  "استلام المواد من الموارد",
  "تحديد موقع الحفلة",
  "بدء التنفيذ",
  "استلام المواد من الحفلة",
  "تسليم المواد للموارد",
] as const;

export const OPERATIONAL_TOTAL = OPERATIONAL_STEPS.length;

/** هل بدأ تنفيذ الحفلة ميدانياً؟
 *
 *  «مكتملة» ليست دليلاً على ذلك: بعد توحيد الحالات صارت تعني التسوية
 *  المالية وحدها — حفلة تُدفع بالكامل قبل يومها تصير مكتملة ولم يبدأ
 *  تنفيذها بعد. إدراجها هنا كان يُظهر الخطوة الثالثة مُنجزة والأولى
 *  والثانية لا، فيتناقض العدّاد مع القائمة.
 *
 *  الحالات الوسيطة القديمة تبقى مقروءة: هي وحدها التي كانت تحمل
 *  معنى التشغيل في المخطّط السابق. */
export function hasStartedExecuting(c: Pick<Concert,
  "executingStarted" | "status" | "returnApproved" | "supervisorDeliveredToWarehouse" | "warehouseReturnConfirmed"
>): boolean {
  if (c.executingStarted) return true;
  /* خطوة لاحقة تمّت ⇒ ما قبلها تمّ بالضرورة */
  if (c.returnApproved || c.supervisorDeliveredToWarehouse || c.warehouseReturnConfirmed) return true;
  const legacyExecuting = ["executing", "materials_returned", "delivered_to_warehouse", "warehouse_confirmed"];
  return legacyExecuting.includes(c.status as string);
}

/** مفاتيح الخطوات كما يفهمها الخادم — الترتيب نفسه ولا مصدر ثانٍ له */
export const OPERATIONAL_FLAGS = ["delivery", "location", "executing", "return", "toWarehouse"] as const;
export type OperationalFlag = (typeof OPERATIONAL_FLAGS)[number];

export interface OperationalStep {
  flag: OperationalFlag;
  label: string;
  /** مُنجَزة في العرض — تشمل المُستنتَجة من خطوة لاحقة */
  done: boolean;
  /** مُنجَزة فعلاً: لها علامة محفوظة، لا مجرد استنتاج */
  recorded: boolean;
  /** خضراء لأن خطوة بعدها تمّت، لا لأنها سُجّلت */
  implied: boolean;
  /** من سجّلها ومتى — فارغان في المُستنتَجة */
  by: string | null;
  at: Timestamp | null;
}

export interface OperationalStage {
  /** كم خطوة أُنجزت (0..5) */
  done: number;
  /** اسم الخطوة التالية، أو null إذا اكتملت كلها */
  next: string | null;
  /** نص مختصر للعرض في القوائم */
  label: string;
  /** حالة كل خطوة على حدة — لقائمة الإنجاز */
  steps: OperationalStep[];
}

export function operationalStage(c: Concert): OperationalStage {
  const raw = [
    !!c.deliveryApproved,
    !!c.location,
    hasStartedExecuting(c),
    !!c.returnApproved,
    !!c.supervisorDeliveredToWarehouse,
  ];
  const actors: { by: string | null; at: Timestamp | null }[] = [
    { by: c.deliveryApprovedBy ?? null, at: c.deliveryApprovedAt ?? null },
    { by: null, at: null }, // الموقع قيمة لا علامة — لا صاحب له ولا وقت
    { by: c.executingStartedBy ?? null, at: c.executingStartedAt ?? null },
    { by: c.returnApprovedBy ?? null, at: c.returnApprovedAt ?? null },
    { by: c.supervisorDeliveredToWarehouseBy ?? null, at: c.supervisorDeliveredToWarehouseAt ?? null },
  ];
  /* الخطوات متسلسلة: من أنجز الرابعة فقد مرّ بالثلاث قبلها بالضرورة.
     بلا هذا تظهر فجوة — خطوة خضراء وما قبلها رمادي — ويصير العدّاد
     لا يطابق القائمة. */
  let seen = false;
  const flags = raw
    .slice()
    .reverse()
    .map((f) => (seen = seen || f))
    .reverse();
  const steps: OperationalStep[] = OPERATIONAL_STEPS.map((label, i) => ({
    flag: OPERATIONAL_FLAGS[i],
    label,
    done: flags[i],
    recorded: raw[i],
    implied: flags[i] && !raw[i],
    by: actors[i].by,
    at: actors[i].at,
  }));
  const done = flags.filter(Boolean).length;
  const nextIdx = flags.findIndex((f) => !f);
  const next = nextIdx === -1 ? null : OPERATIONAL_STEPS[nextIdx];
  const label =
    c.warehouseReturnConfirmed ? "اكتمل التشغيل"
    : next ? `${done} من ${OPERATIONAL_TOTAL} — التالي: ${next}`
    : "بانتظار تأكيد الموارد";
  return { done, next, label, steps };
}
