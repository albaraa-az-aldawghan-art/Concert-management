"use client";

/* الشريط الجانبي: قائمة تنقّل تُبنى من دور المستخدم وصلاحياته وإعدادات النظام. */
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firestore/users";
import { cn } from "@/lib/utils";
import { pageKeyFromPath } from "@/lib/permissions";
import { PermissionPage } from "@/types";
import { useSystem } from "@/contexts/SystemContext";
import { applySystemNav } from "@/lib/nav";
import {
  LayoutDashboard,
  Users,
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
  PackagePlus,
  PackageMinus,
  Scale,
  TrendingUp,
  FlaskConical,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const adminNav: NavItem[] = [
  { label: "لوحة التحكم",   href: "/admin",                       icon: <LayoutDashboard size={17} /> },
  { label: "القائمة المالية", href: "/admin/finances",              icon: <BarChart3 size={17} /> },
  /* الحفلات قسم كامل: كل ما يخدم تنفيذ الحفلة تحته، فلا يتنقّل المستخدم
     بين رؤوس متفرّقة ليُنهي حفلة واحدة */
  {
    label: "الحفلات",
    href: "/admin/concerts",
    icon: <Music size={17} />,
    children: [
      { label: "الموارد",        href: "/admin/warehouse",          icon: <Package size={15} /> },
      { label: "طلبات الموارد",  href: "/warehouse-manager/orders", icon: <Truck size={15} /> },
      { label: "البكجات",        href: "/admin/packages",           icon: <Boxes size={15} /> },
      { label: "المطبخ",         href: "/kitchen",                  icon: <ChefHat size={15} /> },
      { label: "ربحية الحفلات",  href: "/admin/profitability",      icon: <TrendingUp size={15} /> },
      { label: "المشرفون",       href: "/supervisor/concerts",      icon: <UserCog size={15} /> },
      { label: "المفقودات",      href: "/admin/missing-items",      icon: <AlertTriangle size={15} /> },
    ],
  },
  /* المطعم والتعاقدات: قناتا بيع مستقلتان لكل منهما تكاليفها */
  { label: "المطعم",     href: "/admin/restaurant", icon: <UtensilsCrossed size={17} /> },
  { label: "التعاقدات",  href: "/admin/contracts",  icon: <FileSignature size={17} /> },
  {
    label: "منتجات البيع",
    href: "/admin/food",
    icon: <UtensilsCrossed size={17} />,
  },
  {
    label: "التكاليف",
    href: "/admin/costs",
    icon: <Barcode size={17} />,
    children: [
      { label: "الوارد", href: "/admin/costs/incoming", icon: <PackagePlus size={15} /> },
      { label: "الإنتاج", href: "/admin/costs/production", icon: <FlaskConical size={15} /> },
      { label: "المنصرف", href: "/admin/costs/outgoing", icon: <PackageMinus size={15} /> },
      { label: "التالف", href: "/admin/costs/damage", icon: <AlertTriangle size={15} /> },
      { label: "رصيد الأصناف", href: "/admin/costs/balance", icon: <Scale size={15} /> },
    ],
  },
  /* الموظفون: من هم، وما دور كلٍّ منهم — ولكل موظف مسار خاص به */
  { label: "الموظفون", href: "/admin/users", icon: <UserRound size={17} /> },
  {
    label: "الإعدادات",
    href: "/settings",
    icon: <Settings size={17} />,
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
    <div className="flex flex-col h-full" style={{ background: "#111D35" }}>

      {/* ── Logo / Brand ── */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(176,189,201,0.12)" }}>
        <div className="flex items-center gap-3">
          {/* Logo image */}
          <div
            className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ width: 44, height: 44, background: "#1C2D50" }}
          >
            <img
              src="/logo.jpg"
              alt="الفريج"
              style={{ width: 44, height: 44, objectFit: "cover", display: "block" }}
            />
          </div>
          <div className="min-w-0">
            <p className="font-bold leading-tight text-sm" style={{ color: "#D4DCE8" }}>الفريج</p>
            <p className="text-xs mt-0.5" style={{ color: "#6B7E99" }}>إدارة الفعاليات</p>
          </div>
        </div>
      </div>

      {/* ── User Info ── */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(176,189,201,0.12)" }}>
        <div className="flex items-center gap-3">
          {/* Avatar with initials */}
          <div
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: "linear-gradient(135deg, #1C2D50, #263C6E)", color: "#D4DCE8" }}
          >
            {appUser?.name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#D4DCE8" }}>{appUser?.name}</p>
            <p className="text-xs truncate" style={{ color: "#6B7E99" }}>
              {roleLabel ?? roleLabels[appUser?.role ?? ""]}
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (
                item.href !== "/admin" &&
                item.href !== "/supervisor" &&
                item.href !== "/employee" &&
                item.href !== "/warehouse-manager" &&
                pathname.startsWith(item.href)
              );

            const childActive = item.children?.some((c) => pathname.startsWith(c.href)) ?? false;
            const isOpen = openGroups[item.href] ?? childActive;

            return (
              <li key={item.href}>
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative flex-1",
                      isActive
                        ? "nav-active-glow"
                        : ""
                    )}
                    style={
                      isActive
                        ? {
                            background: "rgba(28,45,80,0.9)",
                            color: "#D4DCE8",
                          }
                        : {
                            color: "#6B7E99",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(28,45,80,0.45)";
                        (e.currentTarget as HTMLElement).style.color = "#B0BDC9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "#6B7E99";
                      }
                    }}
                  >
                    <span style={{ color: isActive ? "#B0BDC9" : "#4A607C" }}>
                      {item.icon}
                    </span>
                    {item.label}

                    {/* Active indicator dot */}
                    {isActive && !item.children && (
                      <span
                        className="mr-auto w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "#B0BDC9" }}
                      />
                    )}
                  </Link>
                  {item.children && (
                    <button
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))
                      }
                      className="p-2 rounded-lg transition-transform"
                      style={{ color: "#4A607C", transform: isOpen ? "rotate(180deg)" : undefined }}
                      aria-label={isOpen ? "طي القائمة" : "فتح القائمة"}
                    >
                      <ChevronDown size={15} />
                    </button>
                  )}
                </div>

                {/* Sub-items */}
                {item.children && isOpen && (
                  <ul className="mt-0.5 mb-1 mr-5 pr-3 space-y-0.5" style={{ borderRight: "1px solid rgba(176,189,201,0.15)" }}>
                    {item.children.map((child) => {
                      const childIsActive = pathname.startsWith(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onClose}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
                            style={
                              childIsActive
                                ? { background: "rgba(28,45,80,0.9)", color: "#D4DCE8" }
                                : { color: "#6B7E99" }
                            }
                            onMouseEnter={(e) => {
                              if (!childIsActive) {
                                (e.currentTarget as HTMLElement).style.background = "rgba(28,45,80,0.45)";
                                (e.currentTarget as HTMLElement).style.color = "#B0BDC9";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!childIsActive) {
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                                (e.currentTarget as HTMLElement).style.color = "#6B7E99";
                              }
                            }}
                          >
                            <span style={{ color: childIsActive ? "#B0BDC9" : "#4A607C" }}>
                              {child.icon}
                            </span>
                            {child.label}
                            {childIsActive && (
                              <span className="mr-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#B0BDC9" }} />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Logout ── */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(176,189,201,0.12)" }}>
        <button
          onClick={onSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: "#6B7E99" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.12)";
            (e.currentTarget as HTMLElement).style.color = "#F87171";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#6B7E99";
          }}
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
      result.push(children && children.length > 0 ? { ...item, children } : { label: item.label, href: item.href, icon: item.icon });
    } else if (children && children.length > 0) {
      result.push(...children);
    }
  }
  return result;
}

export function Sidebar() {
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
  const visibleNav = applySystemNav(navItems, settings.features, settings.labels);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const noOp = () => {};

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex flex-col w-64 h-full fixed top-0 right-0 bottom-0 z-40"
        style={{ background: "#111D35" }}
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
        className="lg:hidden fixed top-3 right-3 z-40 p-2.5 rounded-xl shadow-lg active:scale-95 transition-transform"
        style={{ background: "#1C2D50", color: "#D4DCE8" }}
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
            style={{ background: "#111D35" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 left-4 z-10 p-2 rounded-lg transition-colors active:bg-white/10"
              style={{ color: "#6B7E99" }}
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
