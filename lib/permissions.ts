import { AppUser, CustomRole, PermissionLevel, PermissionPage } from "@/types";

// Every page a custom role can be granted, in sidebar display order.
export const PERMISSION_PAGES: { key: PermissionPage; label: string; href: string }[] = [
  { key: "dashboard",     label: "لوحة التحكم",    href: "/admin" },
  { key: "finances",      label: "القائمة المالية", href: "/admin/finances" },
  { key: "concerts",      label: "الحفلات",         href: "/admin/concerts" },
  { key: "users",         label: "المستخدمون",      href: "/admin/users" },
  { key: "warehouse",     label: "المخزن",          href: "/admin/warehouse" },
  { key: "food",          label: "أصناف الأكل",     href: "/admin/food" },
  { key: "missing_items", label: "المفقودات",       href: "/admin/missing-items" },
  { key: "kitchen",       label: "طلبات المطبخ",    href: "/kitchen" },
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

// Central access check. Admin sees everything; a custom role follows its
// permission map; the kitchen base role owns the kitchen page; other base
// roles never touch /admin pages (they have their own dashboards).
export function canAccess(
  user: AppUser | null,
  customRole: CustomRole | null,
  page: PermissionPage,
  level: PermissionLevel = "view"
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "kitchen") return page === "kitchen";
  if (user.role === "custom") {
    const granted = customRole?.permissions?.[page];
    if (!granted) return false;
    return level === "view" ? true : granted === "manage";
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
  const first = PERMISSION_PAGES.find((p) => canAccess(user, customRole, p.key, "view"));
  return first?.href ?? "/settings";
}
