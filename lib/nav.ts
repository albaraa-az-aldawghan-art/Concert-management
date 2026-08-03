import { SystemFeatures, SystemLabels } from "@/lib/firestore/system";

/* ═══════════════════════════════════════════════════════════════
   تطبيق إعدادات النظام على قائمة التنقّل: حذف الميزات الموقوفة،
   واستبدال مسمّيات الأقسام بما اختاره المدير.

   الربط بالمسار لا بالاسم — الاسم نفسه هو ما يُغيّره المستخدم.
   ═══════════════════════════════════════════════════════════════ */

interface NavLike {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: NavLike[];
}

/** المسار ← الميزة التي تتحكّم بظهوره */
const FEATURE_BY_HREF: { prefix: string; key: keyof SystemFeatures }[] = [
  { prefix: "/admin/costs/production", key: "production" },
  { prefix: "/admin/costs/damage", key: "damage" },
  { prefix: "/admin/profitability", key: "profitability" },
];

/** المسار ← المسمّى القابل للتغيير */
const LABEL_BY_HREF: { href: string; key: keyof SystemLabels }[] = [
  { href: "/admin/concerts", key: "concerts" },
  { href: "/admin/warehouse", key: "warehouse" },
  { href: "/warehouse-manager/warehouse", key: "warehouse" },
  { href: "/admin/costs", key: "costs" },
  { href: "/kitchen", key: "kitchen" },
  { href: "/admin/profitability", key: "profitability" },
];

function enabled(href: string, features: SystemFeatures): boolean {
  const m = FEATURE_BY_HREF.find((f) => href.startsWith(f.prefix));
  return !m || features[m.key] !== false;
}

function labelFor(item: NavLike, labels: SystemLabels): string {
  const m = LABEL_BY_HREF.find((l) => l.href === item.href);
  const custom = m ? labels[m.key]?.trim() : "";
  return custom || item.label;
}

export function applySystemNav<T extends NavLike>(
  items: T[],
  features: SystemFeatures,
  labels: SystemLabels
): T[] {
  return items
    .filter((i) => enabled(i.href, features))
    .map((i) => ({
      ...i,
      label: labelFor(i, labels),
      children: i.children ? applySystemNav(i.children, features, labels) : undefined,
    }));
}
