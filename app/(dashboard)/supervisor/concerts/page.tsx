"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsBySupervisor, getConcerts } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Concert } from "@/types";
import { formatDate } from "@/lib/utils";
import { Music, Calendar, MapPin } from "lucide-react";

export default function SupervisorConcertsPage() {
  const { appUser } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    if (!appUser) return;
    // The admin supervises everything — full list with full supervisor powers
    const fetcher = isAdmin ? getConcerts() : getConcertsBySupervisor(appUser.uid);
    fetcher
      .then((data) => setConcerts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  const filtered = filterStatus ? concerts.filter((c) => c.status === filterStatus) : concerts;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "حفلات المشرفين" : "حفلاتي"}</h2>
        <p className="text-sm text-slate-500">{concerts.length} حفلة{isAdmin ? " — صلاحيات المشرف الكاملة" : ""}</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["", "planned", "active", "completed"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === s ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {s === "" ? "الكل" : s === "planned" ? "مخططة" : s === "active" ? "جارية" : "منتهية"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Music size={40} className="mb-3 opacity-40" /><p>لا توجد حفلات</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((concert) => (
            <Link key={concert.id} href={`/supervisor/concerts/${concert.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-slate-800">{concert.name}</h3>
                  <StatusBadge status={concert.status} />
                </div>
                <div className="space-y-1 text-sm text-slate-500">
                  <div className="flex items-center gap-2"><Calendar size={13} /><span>{formatDate(concert.date)}</span></div>
                  {concert.location?.address && (
                    <div className="flex items-start gap-2"><MapPin size={13} className="shrink-0 mt-0.5" /><span className="line-clamp-1">{concert.location.address}</span></div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex gap-2 flex-wrap">
                  {concert.deliveryApproved
                    ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ تسليم مقبول</span>
                    : <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">⏳ انتظار قبول التسليم</span>
                  }
                  {concert.returnApproved
                    ? <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ استلام مقبول</span>
                    : null
                  }
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
