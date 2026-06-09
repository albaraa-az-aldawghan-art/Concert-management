"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsByEmployee, getConcertItems } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Concert, ConcertItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Package, Calendar, ChevronLeft } from "lucide-react";

export default function EmployeeDashboard() {
  const { appUser } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [myItems, setMyItems] = useState<ConcertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    async function load() {
      const cs = await getConcertsByEmployee(appUser!.uid);
      setConcerts(cs);
      const allItems: ConcertItem[] = [];
      for (const c of cs) {
        const items = await getConcertItems(c.id);
        const mine = items.filter((i) => i.assignedToEmployeeId === appUser!.uid);
        allItems.push(...mine);
      }
      setMyItems(allItems);
      setLoading(false);
    }
    load();
  }, [appUser]);

  const pendingDelivery = myItems.filter((i) => i.deliveryStatus === "pending").length;
  const pendingReturn = myItems.filter((i) => i.returnStatus === "pending").length;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">مرحباً، {appUser?.name}</h2>
        <p className="text-sm text-slate-500 mt-1">أنت موظف في {concerts.length} حفلة</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "مواد مسندة لي", value: myItems.length, color: "text-blue-600" },
          { label: "تسليم معلق", value: pendingDelivery, color: "text-yellow-600" },
          { label: "استلام معلق", value: pendingReturn, color: "text-orange-600" },
        ].map((s) => (
          <Card key={s.label}>
            <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {(pendingDelivery > 0 || pendingReturn > 0) && (
        <Card className="border-yellow-200 bg-yellow-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-yellow-800">لديك مواد تحتاج تأكيد</p>
              <p className="text-sm text-yellow-600">انتقل إلى صفحة موادي للتأكيد</p>
            </div>
            <Link href="/employee/assignments">
              <button className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700">تأكيد الآن</button>
            </Link>
          </div>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">الحفلات</h3>
          <Link href="/employee/assignments" className="text-sm text-blue-600 flex items-center gap-1">
            أغراضي <ChevronLeft size={14} />
          </Link>
        </div>
        {concerts.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-slate-400">
            <Package size={40} className="mb-3 opacity-40" />
            <p>لم يتم إسناد حفلات إليك</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {concerts.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-bold text-slate-800">{c.name}</h4>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar size={13} /><span>{formatDate(c.date)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
