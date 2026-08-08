/* منطق الصلاحيات: ربط المسار بالصفحة، وفحص ما يملكه المستخدم.
   قائمة الصلاحيات نفسها في lib/permissions-catalog.ts. */

import { AppUser, CustomRole, PermissionPage } from "@/types";
import {
  PERMISSION_CATALOG,
  KEYS_BY_PAGE,
  PermissionPageDef,
  PermGroup,
  PermItem,
} from "@/lib/permissions-catalog";

export type { PermissionPageDef, PermGroup, PermItem };
export { PERMISSION_CATALOG, KEYS_BY_PAGE };
export { TOTAL_PERMISSIONS, PENDING_PERMISSIONS, findPerm } from "@/lib/permissions-catalog";

/** الصيغة المسطّحة: صفحة ولها قائمة صلاحيات — يستعملها العرض المختصر */
export interface FlatPageDef {
  key: PermissionPage;
  label: string;
  href: string;
  features: { key: string; label: string }[];
}

export const PERMISSION_PAGES: FlatPageDef[] = PERMISSION_CATALOG.map((p) => ({
  key: p.key,
  label: p.label,
  href: p.href,
  features: p.groups.flatMap((g) => [
    ...g.actions.map((a) => ({ key: a.key, label: a.label })),
    ...(g.fields ?? []).map((f) => ({ key: f.key, label: `إظهار: ${f.label}` })),
  ]),
}));

/* ── ربط المسار بالصفحة ──────────────────────────────────────
   الترتيب مهم: الأخصّ أولاً، و/admin المجرّد أخيراً. */
export function pageKeyFromPath(pathname: string): PermissionPage | null {
  if (pathname.startsWith("/admin/finances")) return "finances";
  if (pathname.startsWith("/admin/packages")) return "packages";
  if (pathname.startsWith("/admin/concerts")) return "concerts";
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/warehouse")) return "warehouse";
  if (pathname.startsWith("/admin/food")) return "food";
  if (pathname.startsWith("/admin/missing-items")) return "missing_items";
  if (pathname.startsWith("/admin/contracts")) return "contracts";
  if (pathname.startsWith("/admin/restaurant")) return "restaurant";
  if (pathname.startsWith("/admin/costs")) return "costs";
  if (pathname.startsWith("/admin/profitability")) return "profitability";
  if (pathname.startsWith("/admin/control")) return "settings";
  if (pathname.startsWith("/admin")) return "dashboard";
  if (pathname.startsWith("/kitchen")) return "kitchen";
  if (pathname.startsWith("/warehouse-manager/orders")) return "warehouse_orders";
  if (pathname.startsWith("/warehouse-manager")) return "warehouse";
  if (pathname.startsWith("/supervisor")) return "supervisor";
  if (pathname.startsWith("/employee")) return "employees";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}

/* ── قراءة صلاحيات دور ────────────────────────────────────────
   الصيغة القديمة كانت نصاً ("view" | "manage") — تُوحَّد إلى مصفوفة. */
export function normalizedFeatures(
  role: CustomRole | null,
  page: PermissionPage
): string[] | null {
  const raw = role?.permissions?.[page];
  if (raw === undefined || raw === null) return null; // الصفحة غير ممنوحة
  if (Array.isArray(raw)) return raw;
  if (raw === "manage") return KEYS_BY_PAGE[page] ?? [];
  return []; // "view"
}

/** هل يفتح هذه الصفحة أصلاً؟ */
export function canAccess(
  user: AppUser | null,
  customRole: CustomRole | null,
  page: PermissionPage
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true; // الأدمن يملك كل شيء دائماً
  return normalizedFeatures(customRole, page) !== null;
}

/** هل يملك هذه الصلاحية المفردة داخل الصفحة؟ */
export function canFeature(
  user: AppUser | null,
  customRole: CustomRole | null,
  page: PermissionPage,
  feature: string
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const feats = normalizedFeatures(customRole, page);
  return feats !== null && feats.includes(feature);
}

/** أين يهبط بعد الدخول؟ أول صفحة يفتحها فعلاً. */
export function firstAllowedPath(user: AppUser | null, customRole: CustomRole | null): string {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  /* الأدوار الجاهزة لها مهابط معروفة، لكن الصلاحيات هي الحكم:
     دور عُدِّلت صلاحياته حتى فقد مهبطه يهبط على أول ما يفتحه */
  const preferred: Record<string, string> = {
    warehouse_manager: "/warehouse-manager",
    supervisor: "/supervisor",
    employee: "/employee",
    kitchen: "/kitchen",
  };
  const home = preferred[user.role];
  if (home) {
    const page = pageKeyFromPath(home);
    if (page && canAccess(user, customRole, page)) return home;
  }
  const first = PERMISSION_CATALOG.find((p) => canAccess(user, customRole, p.key));
  return first?.href ?? "/settings";
}

/* ── الأدوار الجاهزة ──────────────────────────────────────────
   صارت مستندات في custom_roles بمعرّفات ثابتة، فيُعدَّل صلاحياتها
   كأي دور. الحساب يبقى على role الأصلي، ويُترجم إلى معرّف دوره هنا. */

export const BUILT_IN_ROLE_IDS: Record<string, string> = {
  warehouse_manager: "role_warehouse_manager",
  supervisor:        "role_supervisor",
  employee:          "role_employee",
  kitchen:           "role_kitchen",
};

/** معرّف مستند الدور الذي يحكم هذا الحساب، أو null للأدمن */
export function roleDocIdFor(user: { role: string; customRoleId?: string | null }): string | null {
  if (user.role === "admin") return null;
  if (user.role === "custom") return user.customRoleId ?? null;
  return BUILT_IN_ROLE_IDS[user.role] ?? null;
}

/** الصفحات التي يفتحها دور — تُعرض في ملف الموظف */
export function pagesOfRole(role: CustomRole | null): { label: string; href: string; feats: string[] }[] {
  if (!role) return [];
  return PERMISSION_CATALOG.map((p) => {
    const feats = normalizedFeatures(role, p.key);
    if (feats === null) return null;
    const labels = p.groups
      .flatMap((g) => [...g.actions, ...(g.fields ?? [])])
      .filter((i) => feats.includes(i.key))
      .map((i) => i.label);
    return { label: p.label, href: p.href, feats: labels };
  }).filter(Boolean) as { label: string; href: string; feats: string[] }[];
}
