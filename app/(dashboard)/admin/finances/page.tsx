"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getConcerts } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { Concert } from "@/types";
import { formatDate } from "@/lib/utils";
import { TrendingUp, Wallet, Clock, BarChart3, ChevronRight, Building2, Truck, CheckCircle2, AlertCircle, CalendarDays } from "lucide-react";
import { Timestamp } from "firebase/firestore";

function calcHallCost(c: Concert): number {
  if (!c.hallCostType || !c.hallCostValue) return 0;
  if (c.hallCostType === "percentage") return (c.price ?? 0) * c.hallCostValue / 100;
  return c.hallCostValue;
}

function toDateStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Timestamp) return val.toDate().toISOString().split("T")[0];
  if (typeof val === "string") return val.substring(0, 10);
  if (typeof (val as { toDate?: () => Date }).toDate === "function")
    return (val as { toDate: () => Date }).toDate().toISOString().split("T")[0];
  return "";
}

function getWeekBounds(): [string, string] {
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [mon.toISOString().split("T")[0], sun.toISOString().split("T")[0]];
}

function getMonthBounds(): [string, string] {
  const now = new Date();
  return [
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
  ];
}

const STATUS_LABEL: Record<string, string> = { planned: "مخططة", active: "جارية", completed: "مكتملة" };
const STATUS_COLOR: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-100 text-slate-600",
};

type StatusFilter = "all" | "planned" | "active" | "completed";
type DateFilter  = "all" | "today" | "week" | "month" | "custom";

export default function FinancesPage() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    getConcerts().then((data) => { setConcerts(data); setLoading(false); });
  }, []);

  const today      = new Date().toISOString().split("T")[0];
  const [weekStart, weekEnd]   = getWeekBounds();
  const [monthStart, monthEnd] = getMonthBounds();

  const filtered = concerts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (dateFilter !== "all") {
      const d = toDateStr(c.createdAt);
      if (dateFilter === "today"  && d !== today) return false;
      if (dateFilter === "week"   && (d < weekStart || d > weekEnd)) return false;
      if (dateFilter === "month"  && (d < monthStart || d > monthEnd)) return false;
      if (dateFilter === "custom") {
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
      }
    }
    return true;
  });

  const totalRevenue   = filtered.reduce((s, c) => s + (c.price ?? 0), 0);
  const totalCollected = filtered.reduce((s, c) => s + (c.deposit ?? 0), 0);
  const totalRemaining = totalRevenue - totalCollected;
  const totalHall      = filtered.reduce((s, c) => s + calcHallCost(c), 0);
  const totalTransport = filtered.reduce((s, c) => s + (c.transportCost ?? 0), 0);
  const netRevenue     = totalRevenue - totalHall - totalTransport;
  const rate           = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={22} className="text-emerald-600" />
            القائمة المالية
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} من {concerts.length} حفلة</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1">
          لوحة التحكم <ChevronRight size={14} />
        </Link>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "all", label: "الكل" },
          { key: "planned", label: "مخططة" },
          { key: "active", label: "جارية" },
          { key: "completed", label: "مكتملة" },
        ] as { key: StatusFilter; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              statusFilter === f.key ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
            <span className="mr-1.5 text-xs opacity-70">
              ({f.key === "all" ? concerts.length : concerts.filter((c) => c.status === f.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
          <CalendarDays size={15} className="text-blue-600" />
          فلتر بالتاريخ
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all",    label: "الكل" },
            { key: "today",  label: "اليوم" },
            { key: "week",   label: "هذا الأسبوع" },
            { key: "month",  label: "هذا الشهر" },
            { key: "custom", label: "نطاق مخصص" },
          ] as { key: DateFilter; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateFilter === f.key
                  ? "bg-blue-700 text-white"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {dateFilter === "custom" && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium whitespace-nowrap">من:</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium whitespace-nowrap">إلى:</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                مسح
              </button>
            )}
          </div>
        )}

        {dateFilter !== "all" && (
          <p className="text-xs text-slate-400">
            {dateFilter === "today" && `اليوم: ${today}`}
            {dateFilter === "week"  && `الأسبوع: ${weekStart} — ${weekEnd}`}
            {dateFilter === "month" && `الشهر: ${monthStart} — ${monthEnd}`}
            {dateFilter === "custom" && dateFrom && dateTo && `النطاق: ${dateFrom} — ${dateTo}`}
            {" · "}
            <span className="font-semibold text-blue-600">{filtered.length} حفلة</span>
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-blue-600" />
            </div>
            <p className="text-xs text-slate-500">إجمالي الإيرادات</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">{totalRevenue.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Wallet size={18} className="text-emerald-600" />
            </div>
            <p className="text-xs text-slate-500">إجمالي المحصَّل</p>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{totalCollected.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال ({rate}%)</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
              <Clock size={18} className="text-orange-600" />
            </div>
            <p className="text-xs text-slate-500">إجمالي المتبقي</p>
          </div>
          <p className="text-2xl font-bold text-orange-700">{totalRemaining.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-purple-600" />
            </div>
            <p className="text-xs text-slate-500">مصاريف القاعات</p>
          </div>
          <p className="text-2xl font-bold text-purple-700">{totalHall.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-slate-600" />
            </div>
            <p className="text-xs text-slate-500">مصاريف النقل</p>
          </div>
          <p className="text-2xl font-bold text-slate-700">{totalTransport.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={18} className="text-teal-600" />
            </div>
            <p className="text-xs text-slate-500">الإيراد الصافي</p>
          </div>
          <p className="text-2xl font-bold text-teal-700">{netRevenue.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-400">ريال (بعد خصم القاعة والنقل)</p>
        </Card>
      </div>

      {/* Collection Progress */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">نسبة التحصيل</h3>
          <span className={`text-xl font-bold ${rate >= 75 ? "text-emerald-600" : rate >= 40 ? "text-orange-500" : "text-red-500"}`}>{rate}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-700 ${rate >= 75 ? "bg-emerald-500" : rate >= 40 ? "bg-orange-400" : "bg-red-400"}`}
            style={{ width: `${rate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="text-emerald-600 font-semibold">{totalCollected.toLocaleString("ar-SA")} ريال محصَّل</span>
          <span className="text-orange-600 font-semibold">{totalRemaining.toLocaleString("ar-SA")} ريال متبقي</span>
        </div>
      </Card>

      {/* Concerts Table */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-4">تفاصيل الحفلات ({filtered.length})</h3>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
            <p>لا توجد حفلات</p>
            <button
              onClick={() => { setStatusFilter("all"); setDateFilter("all"); }}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              مسح الفلاتر
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="sm:hidden space-y-3">
              {filtered.map((c) => {
                const hall = calcHallCost(c);
                const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                return (
                  <Link key={c.id} href={`/admin/concerts/${c.id}`}>
                    <div className="border border-slate-100 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                          <p className="text-xs text-slate-400">{formatDate(c.date)}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">السعر</p>
                          <p className="font-bold text-slate-800">{(c.price ?? 0).toLocaleString("ar-SA")}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">المحصَّل</p>
                          <p className="font-bold text-emerald-700">{(c.deposit ?? 0).toLocaleString("ar-SA")}</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">المتبقي</p>
                          <p className="font-bold text-orange-700">{remaining.toLocaleString("ar-SA")}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">القاعة + النقل</p>
                          <p className="font-bold text-purple-700">{(hall + (c.transportCost ?? 0)).toLocaleString("ar-SA")}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["العميل", "التاريخ", "الحالة", "السعر", "القاعة", "النقل", "المحصَّل", "المتبقي"].map((h) => (
                      <th key={h} className="text-right text-xs font-semibold text-slate-400 pb-3 px-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((c) => {
                    const hall = calcHallCost(c);
                    const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2">
                          <Link href={`/admin/concerts/${c.id}`} className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-3 px-2 text-slate-500 text-xs">{formatDate(c.date)}</td>
                        <td className="py-3 px-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-bold text-slate-800">{(c.price ?? 0).toLocaleString("ar-SA")}</td>
                        <td className="py-3 px-2 text-purple-700">{hall > 0 ? hall.toLocaleString("ar-SA") : "—"}</td>
                        <td className="py-3 px-2 text-slate-600">{c.transportCost ? c.transportCost.toLocaleString("ar-SA") : "—"}</td>
                        <td className="py-3 px-2 font-bold text-emerald-700">{(c.deposit ?? 0).toLocaleString("ar-SA")}</td>
                        <td className="py-3 px-2">
                          <span className={`font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                            {remaining.toLocaleString("ar-SA")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={3} className="py-3 px-2 font-bold text-slate-700 text-xs">الإجمالي ({filtered.length} حفلة)</td>
                    <td className="py-3 px-2 font-bold text-blue-700">{totalRevenue.toLocaleString("ar-SA")}</td>
                    <td className="py-3 px-2 font-bold text-purple-700">{totalHall > 0 ? totalHall.toLocaleString("ar-SA") : "—"}</td>
                    <td className="py-3 px-2 font-bold text-slate-700">{totalTransport > 0 ? totalTransport.toLocaleString("ar-SA") : "—"}</td>
                    <td className="py-3 px-2 font-bold text-emerald-700">{totalCollected.toLocaleString("ar-SA")}</td>
                    <td className="py-3 px-2 font-bold text-orange-700">{totalRemaining.toLocaleString("ar-SA")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
