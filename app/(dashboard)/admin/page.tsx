"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllUsers } from "@/lib/firestore/users";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getConcerts } from "@/lib/firestore/concerts";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { Card } from "@/components/ui/card";
import { Concert } from "@/types";
import {
  Users, Package, Music, AlertTriangle, ChevronLeft,
  TrendingUp, Wallet, Clock, CheckCircle2, CalendarDays, BarChart3,
} from "lucide-react";

function calcHallCost(c: Concert): number {
  if (!c.hallCostType || !c.hallCostValue) return 0;
  if (c.hallCostType === "percentage") return (c.price ?? 0) * c.hallCostValue / 100;
  return c.hallCostValue;
}

export default function AdminDashboard() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [usersCount, setUsersCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, items, c, missing] = await Promise.all([
        getAllUsers(), getWarehouseItems(), getConcerts(), getAllMissingItems(),
      ]);
      setUsersCount(users.length);
      setItemsCount(items.length);
      setConcerts(c);
      setMissingCount(missing.length);
      setLoading(false);
    }
    load();
  }, []);

  const planned   = concerts.filter((c) => c.status === "planned").length;
  const active    = concerts.filter((c) => c.status === "active").length;
  const completed = concerts.filter((c) => c.status === "completed").length;

  const totalRevenue    = concerts.reduce((s, c) => s + (c.price ?? 0), 0);
  const totalCollected  = concerts.reduce((s, c) => s + (c.deposit ?? 0), 0);
  const totalRemaining  = totalRevenue - totalCollected;
  const totalHall       = concerts.reduce((s, c) => s + calcHallCost(c), 0);
  const totalTransport  = concerts.reduce((s, c) => s + (c.transportCost ?? 0), 0);
  const collectionRate  = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;

  const recent = [...concerts].slice(0, 5);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #080E1C 0%, #111D35 50%, #1C2D50 100%)" }}
      >
        {/* Subtle logo watermark */}
        <div
          className="absolute -left-8 -top-8 opacity-[0.07] pointer-events-none"
          style={{ width: 160, height: 160 }}
        >
          <img src="/logo.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <p className="text-sm mb-1" style={{ color: "#6B7E99" }}>لوحة التحكم</p>
        <h2 className="text-2xl font-bold" style={{ color: "#D4DCE8" }}>نظرة عامة على النظام</h2>
        <p className="text-sm mt-1" style={{ color: "#6B7E99" }}>{concerts.length} حفلة مسجّلة</p>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الإيرادات", value: totalRevenue, icon: <TrendingUp size={20} />, color: "text-[#1C2D50]", bg: "bg-[#EEF1F7]", suffix: "ريال" },
          { label: "إجمالي المحصَّل", value: totalCollected, icon: <Wallet size={20} />, color: "text-emerald-600", bg: "bg-emerald-50", suffix: "ريال" },
          { label: "إجمالي المتبقي", value: totalRemaining, icon: <Clock size={20} />, color: "text-orange-600", bg: "bg-orange-50", suffix: "ريال" },
          { label: "مصاريف القاعات والنقل", value: totalHall + totalTransport, icon: <BarChart3 size={20} />, color: "text-purple-600", bg: "bg-purple-50", suffix: "ريال" },
        ].map((s) => (
          <Card key={s.label}>
            <div className={`w-9 h-9 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mb-3`}>
              {s.icon}
            </div>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString("ar-SA")}</p>
            <p className="text-xs text-slate-400">{s.suffix}</p>
          </Card>
        ))}
      </div>

      {/* Collection Rate */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800">نسبة التحصيل</h3>
            <p className="text-xs text-slate-400 mt-0.5">من إجمالي إيرادات جميع الحفلات</p>
          </div>
          <span className={`text-2xl font-bold ${collectionRate >= 75 ? "text-emerald-600" : collectionRate >= 40 ? "text-orange-500" : "text-red-500"}`}>
            {collectionRate}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${collectionRate >= 75 ? "bg-emerald-500" : collectionRate >= 40 ? "bg-orange-400" : "bg-red-400"}`}
            style={{ width: `${collectionRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>{totalCollected.toLocaleString("ar-SA")} ريال محصَّل</span>
          <span>{totalRemaining.toLocaleString("ar-SA")} ريال متبقي</span>
        </div>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "المستخدمون", value: usersCount, icon: <Users size={18} />, href: "/admin/users", color: "text-[#1C2D50]", bg: "bg-[#EEF1F7]" },
          { label: "أغراض المخزن", value: itemsCount, icon: <Package size={18} />, href: "/admin/warehouse", color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "المفقودات", value: missingCount, icon: <AlertTriangle size={18} />, href: "/admin/missing-items", color: "text-red-600", bg: "bg-red-50" },
          { label: "الحفلات الكلية", value: concerts.length, icon: <Music size={18} />, href: "/admin/concerts", color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${s.bg} ${s.color} flex items-center justify-center shrink-0`}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Concert Status Chart */}
        <Card>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CalendarDays size={16} className="text-violet-600" />
            حالة الحفلات
          </h3>
          <div className="space-y-4">
            {[
              { label: "مخططة", value: planned, color: "bg-[#EEF1F7]0", text: "text-[#1C2D50]", bg: "bg-[#EEF1F7]" },
              { label: "جارية", value: active, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "مكتملة", value: completed, color: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-50" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-600">{s.label}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.value}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${s.color}`}
                    style={{ width: concerts.length > 0 ? `${(s.value / concerts.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-xs text-slate-400">مصاريف القاعات</p>
              <p className="font-bold text-slate-700">{totalHall.toLocaleString("ar-SA")} ريال</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-xs text-slate-400">مصاريف النقل</p>
              <p className="font-bold text-slate-700">{totalTransport.toLocaleString("ar-SA")} ريال</p>
            </div>
          </div>
        </Card>

        {/* Recent Concerts */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Music size={16} className="text-violet-600" />
              آخر الحفلات
            </h3>
            <Link href="/admin/concerts" className="text-xs text-[#1C2D50] font-semibold hover:underline flex items-center gap-1">
              عرض الكل <ChevronLeft size={12} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد حفلات</p>
          ) : (
            <div className="space-y-2">
              {recent.map((c) => {
                const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                return (
                  <Link key={c.id} href={`/admin/concerts/${c.id}`}>
                    <div className="flex items-center justify-between bg-slate-50 hover:bg-[#EEF1F7] rounded-xl px-3 py-2.5 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.price?.toLocaleString("ar-SA")} ريال</p>
                      </div>
                      <div className="text-left shrink-0 mr-2">
                        <p className={`text-xs font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                          {remaining > 0 ? `متبقي ${remaining.toLocaleString("ar-SA")}` : "مكتمل"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {c.status === "planned" ? "مخططة" : c.status === "active" ? "جارية" : "مكتملة"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link href="/admin/finances" className="flex items-center justify-center gap-2 text-sm font-semibold text-[#1C2D50] hover:text-[#111D35] transition-colors py-1">
              <BarChart3 size={16} />
              عرض القائمة المالية الكاملة
            </Link>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-3">روابط سريعة</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إنشاء حفلة", href: "/admin/concerts/new", icon: <Music size={16} />, color: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
            { label: "القائمة المالية", href: "/admin/finances", icon: <BarChart3 size={16} />, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
            { label: "إضافة مستخدم", href: "/admin/users", icon: <Users size={16} />, color: "bg-[#EEF1F7] text-[#1C2D50] hover:bg-[#D4DCE8]" },
            { label: "المفقودات", href: "/admin/missing-items", icon: <AlertTriangle size={16} />, color: "bg-red-50 text-red-700 hover:bg-red-100" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold transition-colors ${link.color}`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
