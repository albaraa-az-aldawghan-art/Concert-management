"use client";

/* لوحة مسؤول الموارد: ما يحتاج تسليماً أو استلاماً. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { getConcerts } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { Package, PackageCheck, AlertTriangle, ChevronLeft } from "lucide-react";

export default function WarehouseManagerDashboard() {
  const [stats, setStats] = useState({ items: 0, pendingReturns: 0, missing: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [items, concerts, missing] = await Promise.all([
        getWarehouseItems(),
        getConcerts().catch(() => []),
        getAllMissingItems(),
      ]);
      const pendingReturns = concerts.filter(
        (c) => c.supervisorDeliveredToWarehouse && !c.warehouseReturnConfirmed
      ).length;
      setStats({ items: items.length, pendingReturns, missing: missing.length });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: "أغراض الموارد", value: stats.items, icon: <Package size={24} />, href: "/warehouse-manager/warehouse", bg: "bg-indigo-50", text: "text-indigo-600" },
    { label: "مرتجعات بانتظار التأكيد", value: stats.pendingReturns, icon: <PackageCheck size={24} />, href: "/warehouse-manager/orders", bg: "bg-orange-50", text: "text-orange-600" },
    { label: "المفقودات", value: stats.missing, icon: <AlertTriangle size={24} />, href: "/warehouse-manager/missing-items", bg: "bg-red-50", text: "text-red-600" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">لوحة تحكم مدير الموارد</h2>
        <p className="text-sm text-slate-500 mt-1">نظرة عامة على الموارد والطلبات</p>
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

      {stats.pendingReturns > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <div className="flex items-center gap-3">
            <PackageCheck size={20} className="text-orange-600" />
            <div className="flex-1">
              <p className="font-semibold text-orange-800">
                {stats.pendingReturns} حفلة بانتظار تأكيد استلام موادها
              </p>
              <p className="text-sm text-orange-600">بتأكيدك تُعاد الكميات لرصيد الموارد</p>
            </div>
            <Link href="/warehouse-manager/orders">
              <button className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors">
                مراجعة
              </button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
