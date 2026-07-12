import { AppUser, CustomRole, PermissionPage } from "@/types";

export interface PermissionFeature {
  key: string;
  label: string;
}

export interface PermissionPageDef {
  key: PermissionPage;
  label: string;
  href: string;
  features: PermissionFeature[];
}

// The full catalog: every page a custom role can open, and inside it every
// capability that can be switched on/off individually (checklist style).
// Enabling a page with ZERO features = pure view of the page shell.
export const PERMISSION_PAGES: PermissionPageDef[] = [
  {
    key: "dashboard",
    label: "لوحة التحكم",
    href: "/admin",
    features: [
      { key: "rev",             label: "إجمالي الإيرادات" },
      { key: "collected",       label: "إجمالي المحصَّل" },
      { key: "remaining",       label: "إجمالي المتبقي" },
      { key: "costs",           label: "مصاريف القاعات والنقل" },
      { key: "collection_rate", label: "نسبة التحصيل" },
      { key: "counters",        label: "عدادات النظام (مستخدمون، مخزن، مفقودات)" },
      { key: "status_chart",    label: "مخطط حالة الحفلات" },
      { key: "recent",          label: "آخر الحفلات" },
      { key: "quick_links",     label: "الروابط السريعة" },
    ],
  },
  {
    key: "finances",
    label: "القائمة المالية",
    href: "/admin/finances",
    features: [
      { key: "totals", label: "بطاقات الإجماليات المالية" },
      { key: "table",  label: "جدول الحفلات المالي التفصيلي" },
    ],
  },
  {
    key: "concerts",
    label: "الحفلات",
    href: "/admin/concerts",
    features: [
      { key: "create",       label: "إنشاء حفلة جديدة" },
      { key: "edit",         label: "تعديل بيانات الحفلة والتكاليف" },
      { key: "assign",       label: "إسناد المشرفين والموظفين" },
      { key: "payments",     label: "إدارة الدفعات" },
      { key: "materials",    label: "إدارة مواد الحفلة" },
      { key: "food_items",   label: "إدارة أصناف الأكل" },
      { key: "send_kitchen", label: "الإرسال للمطبخ" },
      { key: "stages",       label: "عرض مراحل الحفلة وسجلها" },
      { key: "contract",     label: "عرض العقد وطباعته" },
      { key: "cancel",       label: "إلغاء الحفلة" },
      { key: "delete",       label: "حذف الحفلة" },
    ],
  },
  {
    key: "users",
    label: "المستخدمون",
    href: "/admin/users",
    features: [
      { key: "create", label: "إنشاء مستخدم" },
      { key: "edit",   label: "تعديل مستخدم (الاسم وكلمة المرور)" },
      { key: "delete", label: "حذف مستخدم" },
    ],
  },
  {
    key: "warehouse",
    label: "المخزن",
    href: "/admin/warehouse",
    features: [
      { key: "add",    label: "إضافة مادة" },
      { key: "edit",   label: "تعديل مادة وصورتها" },
      { key: "delete", label: "حذف مادة" },
    ],
  },
  {
    key: "food",
    label: "أصناف الأكل",
    href: "/admin/food",
    features: [
      { key: "add",     label: "إضافة قسم" },
      { key: "edit",    label: "تعديل قسم وأصنافه" },
      { key: "delete",  label: "حذف قسم" },
      { key: "reorder", label: "إعادة ترتيب الأقسام بالسحب" },
    ],
  },
  {
    key: "missing_items",
    label: "المفقودات",
    href: "/admin/missing-items",
    features: [
      { key: "resolve", label: "معالجة وتحديث المفقودات" },
    ],
  },
  {
    key: "kitchen",
    label: "طلبات المطبخ",
    href: "/kitchen",
    features: [
      { key: "confirm", label: "تأكيد استلام الحفلات" },
    ],
  },
];

// Maps a pathname under /admin (or /kitchen) to its permission key.
// Order matters: more specific prefixes first, bare /admin last.
export function pageKeyFromPath(pathname: string): PermissionPage | null {
  if (pathname.startsWith("/admin/finances")) return "finances";
  if (pathname.startsWith("/admin/concerts")) return "concerts";
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/warehouse")) return "warehouse";
  if (pathname.startsWith("/admin/food")) return "food";
  if (pathname.startsWith("/admin/missing-items")) return "missing_items";
  if (pathname.startsWith("/admin")) return "dashboard";
  if (pathname.startsWith("/kitchen")) return "kitchen";
  return null;
}

// Older roles stored "view" / "manage" strings — normalize both formats to a
// feature array: "view" → no features, "manage" → every feature of the page.
export function normalizedFeatures(role: CustomRole | null, page: PermissionPage): string[] | null {
  const raw = role?.permissions?.[page];
  if (raw === undefined || raw === null) return null; // page not granted
  if (Array.isArray(raw)) return raw;
  if (raw === "manage") {
    return PERMISSION_PAGES.find((p) => p.key === page)?.features.map((f) => f.key) ?? [];
  }
  return []; // "view"
}

// Can this user OPEN the page at all?
export function canAccess(
  user: AppUser | null,
  customRole: CustomRole | null,
  page: PermissionPage
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true; // المدير يملك كل شيء دائماً
  if (user.role === "kitchen") return page === "kitchen";
  if (user.role === "custom") return normalizedFeatures(customRole, page) !== null;
  return false;
}

// Can this user USE a specific capability inside the page?
export function canFeature(
  user: AppUser | null,
  customRole: CustomRole | null,
  page: PermissionPage,
  feature: string
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "kitchen") return page === "kitchen";
  if (user.role === "custom") {
    const feats = normalizedFeatures(customRole, page);
    return feats !== null && feats.includes(feature);
  }
  return false;
}

// Where to land after login, based on what the user can actually open.
export function firstAllowedPath(user: AppUser | null, customRole: CustomRole | null): string {
  if (!user) return "/login";
  const fixed: Record<string, string> = {
    admin: "/admin",
    warehouse_manager: "/warehouse-manager",
    supervisor: "/supervisor",
    employee: "/employee",
    kitchen: "/kitchen",
  };
  if (user.role !== "custom") return fixed[user.role] ?? "/login";
  const first = PERMISSION_PAGES.find((p) => canAccess(user, customRole, p.key));
  return first?.href ?? "/settings";
}
