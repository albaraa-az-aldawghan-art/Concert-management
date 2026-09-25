"use client";

/* ترويسة الصفحة: اسم المستخدم والتاريخ والخروج. */
import React from "react";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";

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
    if (pathname.includes("/contracts/")) return "تفاصيل التعاقد";
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
    <header className="app-header px-4 sm:px-6 xl:px-8 flex items-center justify-between sticky top-0 z-30">
      <div className="lg:hidden w-11" />
      <div className="min-w-0 flex items-center gap-3">
        <div className="hidden sm:flex w-9 h-9 rounded-xl bg-[#EEF1F7] text-[#1C2D50] items-center justify-center border border-[#D4DCE8]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-[#3A5490] hidden sm:block mb-0.5">الفريج / نظام الإدارة</p>
          <h1 className="text-sm sm:text-lg font-extrabold text-slate-900 truncate">{getTitle()}</h1>
        </div>
      </div>
      <div className="text-xs font-semibold text-slate-600 hidden sm:flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3.5 py-2 shadow-sm tabular-nums-auto">
        <CalendarDays size={14} className="text-[#1C2D50]" />
        {(() => {
          const d = new Date();
          const weekday = d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long" });
          return `${weekday}، ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        })()}
      </div>
    </header>
  );
}
