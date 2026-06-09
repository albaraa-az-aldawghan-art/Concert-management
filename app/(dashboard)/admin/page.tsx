"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllUsers } from "@/lib/firestore/users";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getConcerts } from "@/lib/firestore/concerts";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { Card } from "@/components/ui/card";
import { Users, Package, Music, AlertTriangle, ChevronLeft } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    users: 0,
    items: 0,
    concerts: 0,
    missing: 0,
    activeConcerts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, items, concerts, missing] = await Promise.all([
        getAllUsers(),
        getWarehouseItems(),
        getConcerts(),
        getAllMissingItems(),
      ]);
      setStats({
        users: users.length,
        items: items.length,
        concerts: concerts.length,
        missing: missing.length,
        activeConcerts: concerts.filter((c) => c.status === "active").length,
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    {
      label: "المستخدمون",
      value: stats.users,
      icon: <Users size={24} />,
      href: "/admin/users",
      color: "bg-blue-500",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      label: "أغراض المخزن",
      value: stats.items,
      icon: <Package size={24} />,
      href: "/admin/warehouse",
      color: "bg-indigo-500",
      bg: "bg-indigo-50",
      text: "text-indigo-600",
    },
    {
      label: "الحفلات",
      value: stats.concerts,
      sub: `${stats.activeConcerts} جارية`,
      icon: <Music size={24} />,
      href: "/admin/concerts",
      color: "bg-violet-500",
      bg: "bg-violet-50",
      text: "text-violet-600",
    },
    {
      label: "المفقودات",
      value: stats.missing,
      icon: <AlertTriangle size={24} />,
      href: "/admin/missing-items",
      color: "bg-red-500",
      bg: "bg-red-50",
      text: "text-red-600",
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">مرحباً بك في لوحة التحكم</h2>
        <p className="text-sm text-slate-500 mt-1">نظرة عامة على النظام</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{card.value}</p>
                  {card.sub && <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>}
                </div>
                <div className={`${card.bg} ${card.text} p-3 rounded-xl`}>
                  {card.icon}
                </div>
              </div>
              <div className={`mt-4 flex items-center gap-1 text-xs font-semibold ${card.text}`}>
                عرض التفاصيل
                <ChevronLeft size={14} />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">روابط سريعة</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "إنشاء حفلة", href: "/admin/concerts/new", icon: <Music size={16} /> },
              { label: "إضافة مستخدم", href: "/admin/users", icon: <Users size={16} /> },
              { label: "المخزن", href: "/admin/warehouse", icon: <Package size={16} /> },
              { label: "المفقودات", href: "/admin/missing-items", icon: <AlertTriangle size={16} /> },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-sm font-medium transition-colors"
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-slate-800 mb-4">حالة الحفلات</h3>
          <div className="space-y-3">
            {[
              { label: "مخططة", value: stats.concerts - stats.activeConcerts, color: "bg-blue-500" },
              { label: "جارية", value: stats.activeConcerts, color: "bg-green-500" },
              { label: "إجمالي", value: stats.concerts, color: "bg-slate-400" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                <span className="text-sm font-bold text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
