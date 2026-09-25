"use client";

/* ترويسة الصفحة: اسم المستخدم والتاريخ والخروج. */
import React from "react";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/admin": "لوحة التحكم",
  "/admin/activity": "سجل النشاطات",
  "/admin/finances": "القائمة المالية",
  "/admin/users": "إدارة المستخدمين",
  "/admin/users/roles": "الأدوار والصلاحيات",
  "/admin/warehouse": "الموارد",
  "/admin/concerts": "الحفلات",
  "/admin/concerts/new": "إنشاء حفلة جديدة",
  "/admin/concerts/drafts": "مسودات الحفلات",
  "/admin/missing-items": "المفقودات",
  "/admin/packages": "البكجات",
  "/admin/contracts": "التعاقدات",
  "/admin/restaurant": "المطعم",
  "/admin/food": "منتجات البيع",
  "/admin/profitability": "ربحية الحفلات",
  "/admin/costs": "الأصناف والتكاليف",
  "/admin/costs/incoming": "المشتريات والوارد",
  "/admin/costs/production": "الإنتاج",
  "/admin/costs/outgoing": "المنصرف",
  "/admin/costs/damage": "التالف",
  "/admin/costs/balance": "رصيد الأصناف",
  "/admin/control": "مركز التحكم",
  "/kitchen": "طلبات المطبخ",
  "/warehouse-manager": "لوحة التحكم",
  "/warehouse-manager/warehouse": "إدارة الموارد",
  "/warehouse-manager/orders": "طلبات الموارد",
  "/warehouse-manager/missing-items": "المفقودات",
  "/supervisor": "لوحة التحكم",
  "/supervisor/concerts": "حفلاتي",
  "/employee": "لوحة التحكم",
  "/employee/assignments": "موادي",
  "/settings": "إعدادات الحساب",
};

export function Header() {
  const pathname = usePathname();

  const getTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    if (pathname.includes("/contracts/")) return "تفاصيل العقد";
    if (pathname.includes("/users/roles/")) return "تعديل الدور والصلاحيات";
    if (pathname.includes("/users/")) return "ملف الموظف";
    if (pathname.includes("/warehouse-manager/orders/")) return "كشف طلب الموارد";
    if (pathname.includes("/kitchen/")) return "كشف طلب المطبخ";
    if (pathname.includes("/employee/assignments/")) return "تفاصيل الحفلة";
    if (pathname.includes("/concerts/") && pathname.includes("/admin")) return "تفاصيل الحفلة";
    if (pathname.includes("/concerts/") && pathname.includes("/supervisor")) return "تفاصيل الحفلة";
    return "نظام إدارة الحفلات";
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 xl:px-8 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="lg:hidden w-10" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 hidden sm:block">نظام الفريج الداخلي</p>
        <h1 className="text-sm sm:text-base font-bold text-slate-800 truncate">{getTitle()}</h1>
      </div>
      <div className="text-xs text-slate-500 hidden sm:flex items-center rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 tabular-nums-auto">
        {(() => {
          const d = new Date();
          const weekday = d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long" });
          return `${weekday}، ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        })()}
      </div>
    </header>
  );
}
