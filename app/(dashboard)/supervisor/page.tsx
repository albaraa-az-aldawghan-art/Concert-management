"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsBySupervisor } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Concert } from "@/types";
import { hasStartedExecuting } from "@/lib/concert-status";
import { formatDate } from "@/lib/utils";
import { Music, Calendar, MapPin, ChevronLeft } from "lucide-react";

export default function SupervisorDashboard() {
  const { appUser } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    getConcertsBySupervisor(appUser.uid)
      .then((data) => setConcerts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appUser]);

  const active = concerts.filter((c) => hasStartedExecuting(c) && !c.warehouseReturnConfirmed).length;
  const pending = concerts.filter((c) => !c.deliveryApproved).length;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">مرحباً، {appUser?.name}</h2>
        <p className="text-sm text-slate-500 mt-1">أنت مشرف على {concerts.length} حفلة</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "إجمالي الحفلات", value: concerts.length, color: "text-[#1C2D50]", bg: "bg-[#EEF1F7]" },
          { label: "جارية", value: active, color: "text-green-600", bg: "bg-green-50" },
          { label: "تحتاج قبول", value: pending, color: "text-yellow-600", bg: "bg-yellow-50" },
        ].map((s) => (
          <Card key={s.label}>
            <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">حفلاتي</h3>
          <Link href="/supervisor/concerts" className="text-sm text-[#1C2D50] flex items-center gap-1">
            عرض الكل <ChevronLeft size={14} />
          </Link>
        </div>
        {concerts.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-slate-400">
            <Music size={40} className="mb-3 opacity-40" />
            <p>لا توجد حفلات مسندة إليك</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {concerts.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/supervisor/concerts/${c.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-slate-800">{c.name}</h4>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="space-y-1 text-sm text-slate-500">
                    <div className="flex items-center gap-2"><Calendar size={13} /><span>{formatDate(c.date)}</span></div>
                    {c.location?.address && (
                      <div className="flex items-start gap-2"><MapPin size={13} className="mt-0.5 shrink-0" /><span className="line-clamp-1">{c.location.address}</span></div>
                    )}
                  </div>
                  {!c.deliveryApproved && (
                    <div className="mt-3 pt-2 border-t border-slate-100">
                      <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                        ⏳ في انتظار قبول التسليم
                      </span>
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
