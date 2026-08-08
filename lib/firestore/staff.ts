/* ملف الموظف: يجمع كل ما يملكه موظف واحد في مكان واحد ليراه الأدمن.
   كل الاستعلامات بمساواة على حقل واحد، فلا تحتاج فهارس مركّبة،
   والترتيب يتم في الذاكرة. */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { Concert, ConcertItem, MissingItem } from "@/types";
import { Timestamp } from "firebase/firestore";

/** سطر في سجل النشاط: عملية واحدة كتبها هذا الموظف */
export interface ActivityEntry {
  id: string;
  /** مفتاح النوع — يُستعمل للفلترة */
  kind: string;
  /** اسم النوع بالعربية */
  kindLabel: string;
  /** وصف العملية كما تُقرأ */
  text: string;
  /** قيمة مالية إن كان للعملية قيمة */
  amount: number | null;
  at: Timestamp | null;
  /** رابط يفتح موضع العملية، إن وُجد */
  href: string | null;
}

export interface StaffProfile {
  /** حفلات هو موظف فيها */
  asEmployee: Concert[];
  /** حفلات هو مشرف عليها */
  asSupervisor: Concert[];
  /** مواد مسندة إليه (عهدته) */
  custody: (ConcertItem & { concertName?: string })[];
  /** مفقودات بلّغ عنها */
  reported: MissingItem[];
  activity: ActivityEntry[];
  /** مجموعات تعذّرت قراءتها بصلاحية من يشاهد — تُذكر ولا تُخفى */
  blocked: string[];
}

const ts = (v: unknown): Timestamp | null =>
  v && typeof (v as Timestamp).seconds === "number" ? (v as Timestamp) : null;

/** يقرأ مجموعة بمساواة على حقل، ويردّ [] بهدوء إن منعت القواعد القراءة */
async function readBy(
  col: string,
  field: string,
  value: string,
  blocked: string[],
  label: string
): Promise<{ id: string; [k: string]: unknown }[]> {
  try {
    const snap = await getDocs(query(collection(db, col), where(field, "==", value)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    blocked.push(label);
    return [];
  }
}

/* وصف كل مجموعة: من أين تُقرأ، وكيف يُكتب سطرها، وأين يذهب رابطها.
   إضافة مجموعة جديدة لاحقاً = سطر واحد هنا. */
const SOURCES: {
  col: string;
  kind: string;
  label: string;
  text: (d: Record<string, unknown>) => string;
  amount?: (d: Record<string, unknown>) => number | null;
  href?: (d: Record<string, unknown>) => string | null;
}[] = [
  {
    col: "concerts", kind: "concert", label: "حفلة",
    text: (d) => `أنشأ حفلة: ${d.name ?? "—"}`,
    amount: (d) => (typeof d.price === "number" ? d.price : null),
    href: (d) => `/admin/concerts/${d.id}`,
  },
  {
    col: "concert_payments", kind: "payment", label: "دفعة حفلة",
    text: (d) => `سجّل دفعة${d.invoiceNumber ? ` بفاتورة ${d.invoiceNumber}` : ""}`,
    amount: (d) => (typeof d.amount === "number" ? d.amount : null),
    href: (d) => (d.concertId ? `/admin/concerts/${d.concertId}` : null),
  },
  {
    col: "concert_expenses", kind: "expense", label: "مصروف حفلة",
    text: (d) => `فاتورة مصروف: ${d.type ?? "—"}${d.supplierName ? ` — ${d.supplierName}` : ""}`,
    amount: (d) => (typeof d.amount === "number" ? d.amount : null),
    href: (d) => (d.concertId ? `/admin/concerts/${d.concertId}` : null),
  },
  {
    col: "concert_food", kind: "food", label: "أكل حفلة",
    text: (d) => `أضاف صنف أكل: ${d.selectedOption ?? d.categoryName ?? "—"}`,
    href: (d) => (d.concertId ? `/admin/concerts/${d.concertId}` : null),
  },
  {
    col: "concert_logs", kind: "log", label: "تعديل حفلة",
    text: (d) => String(d.description ?? "عدّل حفلة"),
    href: (d) => (d.concertId ? `/admin/concerts/${d.concertId}` : null),
  },
  {
    col: "cost_items", kind: "item", label: "صنف تكاليف",
    text: (d) => `سجّل صنفاً: ${d.name ?? "—"}`,
    href: () => "/admin/costs",
  },
  {
    col: "cost_incoming", kind: "incoming", label: "وارد",
    text: (d) => `وارد: ${d.itemName ?? "—"} ${d.quantity ?? 0} ${d.unit ?? ""} من ${d.supplierName ?? "—"}`,
    amount: (d) => (typeof d.totalBeforeVat === "number" ? d.totalBeforeVat : null),
    href: () => "/admin/costs/incoming",
  },
  {
    col: "cost_outgoing", kind: "outgoing", label: "منصرف",
    text: (d) =>
      `منصرف: ${d.itemName ?? "—"} ${d.quantity ?? 0} ${d.unit ?? ""} → ${
        d.concertName ?? d.contractName ?? d.manualConcertName ?? d.departmentName ?? "—"
      }`,
    amount: (d) => (typeof d.totalCost === "number" ? d.totalCost : null),
    href: () => "/admin/costs/outgoing",
  },
  {
    col: "cost_production", kind: "production", label: "إنتاج",
    text: (d) => `إنتاج: ${d.outputName ?? "—"} ${d.outputQty ?? 0} ${d.outputUnit ?? ""}`,
    amount: (d) => (typeof d.totalCost === "number" ? d.totalCost : null),
    href: () => "/admin/costs/production",
  },
  {
    col: "cost_damage", kind: "damage", label: "تالف",
    text: (d) => `تالف: ${d.itemName ?? "—"} ${d.quantity ?? 0} ${d.unit ?? ""} — ${d.reason ?? "—"}`,
    amount: (d) => (typeof d.totalCost === "number" ? d.totalCost : null),
    href: () => "/admin/costs/damage",
  },
  {
    col: "contracts", kind: "contract", label: "عقد",
    text: (d) => `أنشأ عقداً: ${d.name ?? "—"}`,
    amount: (d) => (typeof d.totalValue === "number" ? d.totalValue : null),
    href: () => "/admin/contracts",
  },
  {
    col: "contract_payments", kind: "contract_payment", label: "دفعة عقد",
    text: (d) => `دفعة عقد${d.invoiceNumber ? ` بفاتورة ${d.invoiceNumber}` : ""}`,
    amount: (d) => (typeof d.amount === "number" ? d.amount : null),
    href: () => "/admin/contracts",
  },
  {
    col: "sales_sections", kind: "section", label: "قسم بيع",
    text: (d) => `أنشأ قسم بيع: ${d.name ?? "—"}`,
    href: () => "/admin/food",
  },
  {
    col: "packages", kind: "package", label: "بكج",
    text: (d) => `أنشأ بكج: ${d.name ?? "—"}`,
    href: () => "/admin/packages",
  },
  {
    col: "custom_roles", kind: "role", label: "دور",
    text: (d) => `أنشأ دوراً: ${d.name ?? "—"}`,
    href: () => "/admin/users",
  },
];

export async function getStaffProfile(uid: string): Promise<StaffProfile> {
  const blocked: string[] = [];

  /* الحفلات والعهدة والمفقودات */
  const [empSnap, supSnap, custodyRaw, reportedRaw] = await Promise.all([
    getDocs(query(collection(db, "concerts"), where("employeeIds", "array-contains", uid)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as Concert)))
      .catch(() => { blocked.push("الحفلات"); return [] as Concert[]; }),
    getDocs(query(collection(db, "concerts"), where("supervisorIds", "array-contains", uid)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as Concert)))
      .catch(() => [] as Concert[]),
    readBy("concert_items", "assignedToEmployeeId", uid, blocked, "العهدة"),
    readBy("missing_items", "reportedBy", uid, blocked, "المفقودات"),
  ]);

  /* سجل النشاط من كل مجموعة تحمل createdBy */
  const perSource = await Promise.all(
    SOURCES.map(async (s) => {
      const rows = await readBy(s.col, "createdBy", uid, blocked, s.label);
      return rows.map<ActivityEntry>((d) => ({
        id: `${s.col}:${d.id}`,
        kind: s.kind,
        kindLabel: s.label,
        text: s.text(d),
        amount: s.amount?.(d) ?? null,
        at: ts(d.createdAt),
        href: s.href?.(d) ?? null,
      }));
    })
  );

  const activity = perSource
    .flat()
    .sort((a, b) => (b.at?.seconds ?? 0) - (a.at?.seconds ?? 0));

  /* اسم الحفلة يُلحق بكل مادة في العهدة لتُقرأ بلا فتح */
  const concertNames = new Map<string, string>();
  for (const c of [...empSnap, ...supSnap]) concertNames.set(c.id, c.name);
  const custody = (custodyRaw as unknown as ConcertItem[]).map((i) => ({
    ...i,
    concertName: concertNames.get(i.concertId),
  }));

  return {
    asEmployee: empSnap,
    asSupervisor: supSnap,
    custody,
    reported: reportedRaw as unknown as MissingItem[],
    activity,
    blocked: [...new Set(blocked)],
  };
}

/* ── آخر تسجيل دخول ───────────────────────────────────────────
   يُقرأ من Firebase Auth عبر الخادم — المتصفح لا يصل إليه.
   هو المقياس الصحيح للخمول لا عدد العمليات: المشرف والموظف والمطبخ
   يقرؤون ولا يكتبون، فعدد عملياتهم صفر مهما دخلوا يومياً. */

export async function getLastSignIn(uids: string[]): Promise<Record<string, string | null>> {
  if (uids.length === 0) return {};
  try {
    const { lastSignIn } = await api.post<{ lastSignIn: Record<string, string | null> }>(
      "/api/admin/last-signin",
      { uids }
    );
    return lastSignIn;
  } catch {
    /* تعذّرت القراءة (صلاحية أو انقطاع) — تُخفى الشارة ولا تُعرض أرقام مخترعة */
    return {};
  }
}

/** كم يوماً مضى على التاريخ؟ null إن لم يوجد تاريخ */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** صياغة المدة بالعربية بأرقام لاتينية */
export function sinceLabel(days: number | null): string {
  if (days === null) return "لم يسجّل دخولاً";
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days < 30) return `قبل ${days} يوماً`;
  const months = Math.floor(days / 30);
  if (months < 12) return `قبل ${months} ${months === 1 ? "شهر" : "أشهر"}`;
  const years = Math.floor(days / 365);
  return `قبل ${years} ${years === 1 ? "سنة" : "سنوات"}`;
}

/** هل تجاوز الحساب حدّ الخمول؟ الحساب الذي لم يدخل قط يُعدّ خاملاً */
export function isIdle(days: number | null, idleMonths: number): boolean {
  return days === null || days >= idleMonths * 30;
}
