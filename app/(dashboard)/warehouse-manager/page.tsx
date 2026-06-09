"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getPendingRequests } from "@/lib/firestore/requests";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { Card } from "@/components/ui/card";
import { Package, ClipboardList, AlertTriangle, ChevronLeft } from "lucide-react";

export default function WarehouseManagerDashboard() {
  const [stats, setStats] = useState({ items: 0, pendingRequests: 0, missing: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [items, requests, missing] = await Promise.all([
        getWarehouseItems(),
        getPendingRequests(),
        getAllMissingItems(),
      ]);
      setStats({ items: items.length, pendingRequests: requests.length, missing: missing.length });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: "أغراض المخزن", value: stats.items, icon: <Package size={24} />, href: "/warehouse-manager/warehouse", bg: "bg-indigo-50", text: "text-indigo-600" },
    { label: "طلبات معلقة", value: stats.pendingRequests, icon: <ClipboardList size={24} />, href: "/warehouse-manager/requests", bg: "bg-yellow-50", text: "text-yellow-600" },
    { label: "المفقودات", value: stats.missing, icon: <AlertTriangle size={24} />, href: "/warehouse-manager/missing-items", bg: "bg-red-50", text: "text-red-600" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">لوحة تحكم مدير المخازن</h2>
        <p className="text-sm text-slate-500 mt-1">نظرة عامة على المخزن والطلبات</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{card.value}</p>
                </div>
                <div className={`${card.bg} ${card.text} p-3 rounded-xl`}>{card.icon}</div>
              </div>
              <div className={`mt-4 flex items-center gap-1 text-xs font-semibold ${card.text}`}>
                عرض التفاصيل <ChevronLeft size={14} />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {stats.pendingRequests > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-3">
            <ClipboardList size={20} className="text-yellow-600" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800">
                لديك {stats.pendingRequests} طلب معلق
              </p>
              <p className="text-sm text-yellow-600">يحتاج مراجعتك وتأكيد الصرف</p>
            </div>
            <Link href="/warehouse-manager/requests">
              <button className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors">
                مراجعة
              </button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
