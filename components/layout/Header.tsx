"use client";

import React from "react";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/admin": "لوحة التحكم",
  "/admin/users": "إدارة المستخدمين",
  "/admin/warehouse": "المخزن",
  "/admin/concerts": "الحفلات",
  "/admin/concerts/new": "إنشاء حفلة جديدة",
  "/admin/missing-items": "المفقودات",
  "/warehouse-manager": "لوحة التحكم",
  "/warehouse-manager/warehouse": "إدارة المخزن",
  "/warehouse-manager/requests": "طلبات المواد",
  "/warehouse-manager/missing-items": "المفقودات",
  "/supervisor": "لوحة التحكم",
  "/supervisor/concerts": "حفلاتي",
  "/employee": "لوحة التحكم",
  "/employee/assignments": "موادي",
};

export function Header() {
  const pathname = usePathname();

  const getTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    if (pathname.includes("/concerts/") && pathname.includes("/admin")) return "تفاصيل الحفلة";
    if (pathname.includes("/concerts/") && pathname.includes("/supervisor")) return "تفاصيل الحفلة";
    return "نظام إدارة الحفلات";
  };

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-30">
      <div className="lg:hidden w-8" />
      <h1 className="text-lg font-bold text-slate-800">{getTitle()}</h1>
      <div className="text-xs text-slate-400 hidden sm:block">
        {new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </div>
    </header>
  );
}
