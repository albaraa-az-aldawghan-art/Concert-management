"use client";

/* الشريط الجانبي: قائمة تنقّل تُبنى من دور المستخدم وصلاحياته وإعدادات النظام. */
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigationGuard } from "@/contexts/NavigationGuardContext";
import { signOut } from "@/lib/firestore/users";
import { cn } from "@/lib/utils";
import { pageKeyFromPath } from "@/lib/permissions";
import { PermissionPage } from "@/types";
import { useSystem } from "@/contexts/SystemContext";
import { applySystemNav } from "@/lib/nav";
import {
  LayoutDashboard,
  Package,
  Music,
  AlertTriangle,
  Boxes,
  FileSignature,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
  UtensilsCrossed,
  BarChart3,
  Settings,
  ChefHat,
  Truck,
  UserCog,
  UserRound,
  ChevronDown,
  Barcode,
  PackageMinus,
  Scale,
  TrendingUp,
  FlaskConical,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section?: string;
  children?: NavItem[];
}

const adminNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/admin", icon: <LayoutDashboard size={17} />, section: "نظرة عامة" },
  {
    label: "الحفلات",
    href: "/admin/concerts",
    icon: <Music size={17} />,
    section: "الأقسام الرئيسية",
    children: [
      { label: "المطبخ",         href: "/kitchen",                  icon: <ChefHat size={15} /> },
      { label: "المشرفون",       href: "/supervisor/concerts",      icon: <UserCog size={15} /> },
      { label: "المفقودات",      href: "/admin/missing-items",      icon: <AlertTriangle size={15} /> },
      { label: "الموارد",        href: "/admin/warehouse",          icon: <Package size={15} /> },
      { label: "طلبات الموارد",  href: "/warehouse-manager/orders", icon: <Truck size={15} /> },
    ],
  },
  { label: "المطعم", href: "/admin/restaurant", icon: <UtensilsCrossed size={17} />, section: "الأقسام الرئيسية" },
  { label: "التعاقدات", href: "/admin/contracts", icon: <FileSignature size={17} />, section: "الأقسام الرئيسية" },
  {
    label: "المنتجات والبكجات",
    href: "/admin/food",
    icon: <Boxes size={17} />,
    section: "المنتجات والبكجات",
    children: [
      { label: "منتجات البيع", href: "/admin/food", icon: <UtensilsCrossed size={15} /> },
      { label: "البكجات", href: "/admin/packages", icon: <Boxes size={15} /> },
    ],
  },
  {
    label: "التكاليف",
    href: "/admin/costs/dashboard",
    icon: <Barcode size={17} />,
    section: "التكاليف",
    children: [
      { label: "المواد الخام", href: "/admin/costs/raw", icon: <Package size={15} /> },
      { label: "المنتجات والوصفات القياسية", href: "/admin/costs/production", icon: <FlaskConical size={15} /> },
      { label: "رصيد الأصناف", href: "/admin/costs/balance", icon: <Scale size={15} /> },
      { label: "المنصرف", href: "/admin/costs/outgoing", icon: <PackageMinus size={15} /> },
    ],
  },
  {
    label: "المالية",
    href: "/admin/finances",
    icon: <BarChart3 size={17} />,
    section: "المالية",
    children: [
      { label: "ربحية الحفلات", href: "/admin/profitability", icon: <TrendingUp size={15} /> },
      { label: "الخسائر", href: "/admin/missing-items", icon: <AlertTriangle size={15} /> },
      { label: "التالف", href: "/admin/costs/damage", icon: <AlertTriangle size={15} /> },
    ],
  },
  /* الموظفون: من هم، وما دور كلٍّ منهم — ولكل موظف مسار خاص به */
  { label: "الموظفون", href: "/admin/users", icon: <UserRound size={17} />, section: "الإدارة" },
  { label: "سجل النشاطات", href: "/admin/activity", icon: <LayoutDashboard size={17} />, section: "الإدارة" },
  {
    label: "الإعدادات",
    href: "/settings",
    icon: <Settings size={17} />,
    section: "الإدارة",
    children: [
      { label: "مركز التحكم", href: "/admin/control", icon: <SlidersHorizontal size={15} /> },
    ],
  },
];

const warehouseManagerNav: NavItem[] = [
  { label: "لوحة التحكم",   href: "/warehouse-manager",                icon: <LayoutDashboard size={17} /> },
  {
    label: "الموارد",
    href: "/warehouse-manager/warehouse",
    icon: <Package size={17} />,
    children: [
      { label: "طلبات الموارد", href: "/warehouse-manager/orders",   icon: <Truck size={15} /> },
    ],
  },
  { label: "المفقودات",      href: "/warehouse-manager/missing-items",  icon: <AlertTriangle size={17} /> },
  { label: "الإعدادات",      href: "/settings",                         icon: <Settings size={17} /> },
];

const supervisorNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/supervisor",          icon: <LayoutDashboard size={17} /> },
  { label: "حفلاتي",       href: "/supervisor/concerts", icon: <Music size={17} /> },
  { label: "الإعدادات",    href: "/settings",            icon: <Settings size={17} /> },
];

const employeeNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/employee",              icon: <LayoutDashboard size={17} /> },
  { label: "حفلاتي",       href: "/employee/assignments",  icon: <Music size={17} /> },
  { label: "الإعدادات",    href: "/settings",              icon: <Settings size={17} /> },
];

const kitchenNav: NavItem[] = [
  { label: "طلبات المطبخ", href: "/kitchen",   icon: <ChefHat size={17} /> },
  { label: "الإعدادات",     href: "/settings",  icon: <Settings size={17} /> },
];

const navByRole: Record<string, NavItem[]> = {
  admin:             adminNav,
  warehouse_manager: warehouseManagerNav,
  supervisor:        supervisorNav,
  employee:          employeeNav,
  kitchen:           kitchenNav,
};

const roleLabels: Record<string, string> = {
  admin:             "أدمن",
  warehouse_manager: "مدير الموارد",
  supervisor:        "مشرف",
  employee:          "موظف",
  kitchen:           "مطبخ",
};

interface SidebarContentProps {
  appUser: ReturnType<typeof useAuth>["appUser"];
  roleLabel?: string;
  pathname: string;
  navItems: NavItem[];
  onClose: () => void;
  onSignOut: () => void;
}

function SidebarContent({ appUser, roleLabel, pathname, navItems, onClose, onSignOut }: SidebarContentProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  return (
    <div className="app-sidebar flex flex-col h-full">

      {/* ── Logo / Brand ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="sidebar-logo">
            <img
              src="/logo.jpg"
              alt="الفريج"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-extrabold leading-tight text-[17px] text-white">الفريج</p>
            <p className="text-[11px] mt-1 text-slate-300">نظام الإدارة الداخلي</p>
          </div>
        </div>
      </div>

      {/* ── User Info ── */}
      <div className="mx-3 mb-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold bg-white text-[#162544] shadow-md">
            {appUser?.name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate text-white">{appUser?.name}</p>
            <p className="text-[11px] truncate text-slate-300 mt-0.5">
              {roleLabel ?? roleLabels[appUser?.role ?? ""]}
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] font-bold tracking-wide text-slate-400">القائمة الرئيسية</p>
        <ul className="space-y-1">
          {navItems.map((item, index) => {
            const isActive =
              pathname === item.href ||
              (
                item.href !== "/admin" &&
                item.href !== "/supervisor" &&
                item.href !== "/employee" &&
                item.href !== "/warehouse-manager" &&
                pathname.startsWith(item.href)
              );

            const childActive = (item.children?.some((c) => pathname.startsWith(c.href)) ?? false) ||
              (item.href === "/admin/costs/dashboard" && pathname.startsWith("/admin/costs"));
            const isOpen = openGroups[item.href] ?? childActive;

            return (
              <React.Fragment key={item.href}>
                {item.section && (index === 0 || navItems[index - 1]?.section !== item.section) && (
                  <li className="sidebar-section-label" aria-hidden="true">{item.section}</li>
                )}
              <li>
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 relative flex-1",
                      isActive && "sidebar-nav-item-active"
                    )}
                  >
                    <span className="sidebar-nav-icon">
                      {item.icon}
                    </span>
                    {item.label}

                    {/* Active indicator dot */}
                    {isActive && !item.children && (
                      <span
                        className="mr-auto w-1.5 h-1.5 rounded-full shrink-0 bg-current opacity-70"
                      />
                    )}
                  </Link>
                  {item.children && (
                    <button
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))
                      }
                      className={cn("p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all", isOpen && "rotate-180")}
                      aria-label={isOpen ? "طي القائمة" : "فتح القائمة"}
                    >
                      <ChevronDown size={15} />
                    </button>
                  )}
                </div>

                {/* Sub-items */}
                {item.children && isOpen && (
                  <ul className="mt-1 mb-2 mr-5 pr-3 space-y-1 border-r border-white/10">
                    {item.children.map((child) => {
                      const childIsActive = pathname.startsWith(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onClose}
                            className={cn(
                              "sidebar-sub-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all duration-150",
                              childIsActive && "sidebar-sub-item-active"
                            )}
                          >
                            <span className="opacity-80">
                              {child.icon}
                            </span>
                            {child.label}
                            {childIsActive && (
                              <span className="mr-auto w-1.5 h-1.5 rounded-full shrink-0 bg-white" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
              </React.Fragment>
            );
          })}
        </ul>
      </nav>

      {/* ── Logout ── */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={onSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-red-200 hover:bg-red-500/10 transition-all duration-150"
        >
          <LogOut size={17} />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

/** روابط تحتاج صلاحية فرعية داخل صفحتها لا مجرّد فتح الصفحة — فمن يملك
 *  «الإنتاج» وحده من التكاليف لا يرى «الوارد» إن لم يُمنحه صراحةً */
const NAV_FEATURE: Record<string, string> = {
  "/admin/costs/incoming":   "in_view",
  "/admin/costs/production": "prod_view",
  "/admin/costs/outgoing":   "out_view",
  "/admin/costs/damage":     "dmg_view",
  "/admin/costs/balance":    "bal_view",
  "/admin/control":          "control",
};

/** يبني قائمة الدور المخصص من adminNav نفسها — لا نسخة موازية قد تفترق
 *  عنها لاحقاً — فترتيب الأقسام وتفريعها يطابقان الأدمن دائماً بالضبط.
 *  عنصر بلا صلاحية صفحته يُسقَط؛ إن كانت له فروع مسموحة تُرفَع فروعه إلى
 *  المستوى الأعلى بدل اختفائها كلياً (مثال: يملك «الموارد» وحدها من دون
 *  «الحفلات» — تظهر «الموارد» مستقلة لا مختبئة تحت قسم لا يفتحه). */
function filterNavForCustomRole(
  items: NavItem[],
  can: (page: PermissionPage) => boolean,
  feat: (page: PermissionPage, feature: string) => boolean
): NavItem[] {
  const result: NavItem[] = [];
  for (const item of items) {
    const children = item.children ? filterNavForCustomRole(item.children, can, feat) : undefined;
    // إعدادات الحساب متاحة للجميع دائماً — تغيير كلمة المرور لا صلاحية له
    const page = item.href === "/settings" ? null : pageKeyFromPath(item.href);
    const feature = NAV_FEATURE[item.href];
    const visible = page === null ? true : feature ? can(page) && feat(page, feature) : can(page);

    if (visible) {
      result.push(children && children.length > 0 ? { ...item, children } : { label: item.label, href: item.href, icon: item.icon, section: item.section });
    } else if (children && children.length > 0) {
      result.push(...children.map((child) => ({ ...child, section: item.section })));
    }
  }
  return result;
}

export function Sidebar() {
  const { request } = useNavigationGuard();
  const { appUser, customRole, can, feat } = useAuth();
  const { settings } = useSystem();
  const pathname    = usePathname();
  const router      = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // الأدوار المخصصة تُبنى قائمتها من نفس قائمة الأدمن، مصفّاة بصلاحياتها
  const navItems: NavItem[] =
    appUser?.role === "custom"
      ? filterNavForCustomRole(adminNav, can, feat)
      : navByRole[appUser?.role ?? "employee"] ?? [];

  // الميزات الموقوفة تُحذف من التنقّل، والمسمّيات تُطبَّق على الأقسام
  const activityNav = can("activity") && !navItems.some((item) => item.href === "/admin/activity")
    ? [...navItems, { label: "سجل النشاطات", href: "/admin/activity", icon: <LayoutDashboard size={17} />, section: "الإدارة" }]
    : navItems;
  const visibleNav = applySystemNav(activityNav, settings.features, settings.labels);

  async function handleSignOut() {
    request(async () => {
      await signOut();
      router.push("/login");
    });
  }

  const noOp = () => {};

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex flex-col w-72 h-full fixed top-0 right-0 bottom-0 z-40 shadow-2xl shadow-slate-950/15"
      >
        <SidebarContent
          appUser={appUser}
          roleLabel={appUser?.role === "custom" ? customRole?.name ?? "دور مخصص" : undefined}
          pathname={pathname}
          navItems={visibleNav}
          onClose={noOp}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile Hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 right-3 z-40 p-2.5 rounded-xl shadow-lg active:scale-95 transition-transform bg-[#1C2D50] text-white"
        aria-label="فتح القائمة"
      >
        <Menu size={20} />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 anim-fade-in backdrop-blur-[2px]"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setMobileOpen(false)}
          />
          {/* RTL: drawer sits on the right and slides in from the right edge */}
          <aside
            className="relative w-[19rem] max-w-[85vw] h-full ml-auto shadow-2xl anim-drawer-in"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 left-4 z-10 p-2 rounded-lg text-slate-300 transition-colors active:bg-white/10"
              aria-label="إغلاق القائمة"
            >
              <X size={20} />
            </button>
            <SidebarContent
              appUser={appUser}
              roleLabel={appUser?.role === "custom" ? customRole?.name ?? "دور مخصص" : undefined}
              pathname={pathname}
              navItems={visibleNav}
              onClose={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}
    </>
  );
}
