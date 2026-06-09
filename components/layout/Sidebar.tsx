"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firestore/users";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  Music,
  AlertTriangle,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  UtensilsCrossed,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const adminNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/admin", icon: <LayoutDashboard size={18} /> },
  { label: "المستخدمون", href: "/admin/users", icon: <Users size={18} /> },
  { label: "المخزن", href: "/admin/warehouse", icon: <Package size={18} /> },
  { label: "الحفلات", href: "/admin/concerts", icon: <Music size={18} /> },
  { label: "أصناف الأكل", href: "/admin/food", icon: <UtensilsCrossed size={18} /> },
  { label: "المفقودات", href: "/admin/missing-items", icon: <AlertTriangle size={18} /> },
];

const warehouseManagerNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/warehouse-manager", icon: <LayoutDashboard size={18} /> },
  { label: "المخزن", href: "/warehouse-manager/warehouse", icon: <Package size={18} /> },
  { label: "طلبات المواد", href: "/warehouse-manager/requests", icon: <ClipboardList size={18} /> },
  { label: "المفقودات", href: "/warehouse-manager/missing-items", icon: <AlertTriangle size={18} /> },
];

const supervisorNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/supervisor", icon: <LayoutDashboard size={18} /> },
  { label: "حفلاتي", href: "/supervisor/concerts", icon: <Music size={18} /> },
];

const employeeNav: NavItem[] = [
  { label: "لوحة التحكم", href: "/employee", icon: <LayoutDashboard size={18} /> },
  { label: "موادي", href: "/employee/assignments", icon: <Package size={18} /> },
];

const navByRole: Record<string, NavItem[]> = {
  admin: adminNav,
  warehouse_manager: warehouseManagerNav,
  supervisor: supervisorNav,
  employee: employeeNav,
};

const roleLabels: Record<string, string> = {
  admin: "مدير",
  warehouse_manager: "مدير المخازن",
  supervisor: "مشرف",
  employee: "موظف",
};

export function Sidebar() {
  const { appUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = navByRole[appUser?.role ?? "employee"] ?? [];

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Music size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">إدارة الحفلات</p>
            <p className="text-xs text-slate-400">{roleLabels[appUser?.role ?? ""]}</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {appUser?.name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{appUser?.name}</p>
            <p className="text-xs text-slate-400 truncate">{appUser?.email}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && item.href !== "/supervisor" && item.href !== "/employee" && item.href !== "/warehouse-manager" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                  )}
                >
                  <span className={cn(isActive ? "text-white" : "text-slate-500")}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-all duration-150"
        >
          <LogOut size={18} />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 h-full fixed top-0 right-0 bottom-0 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-slate-900 text-white rounded-xl shadow-lg"
      >
        <Menu size={20} />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 bg-slate-900 h-full ml-auto shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
