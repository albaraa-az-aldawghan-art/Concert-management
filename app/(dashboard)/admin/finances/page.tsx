"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcerts } from "@/lib/firestore/concerts";
import { Card } from "@/components/ui/card";
import { Concert } from "@/types";
import { formatDate } from "@/lib/utils";
import { STATUS_FILTERS, ConcertStatus4, normalizeStatus, statusLabel, statusColor } from "@/lib/concert-status";
import { TrendingUp, Wallet, Clock, BarChart3, ChevronRight, Building2, Truck, CheckCircle2, AlertCircle, CalendarDays, Search, ChevronLeft, Package, Users } from "lucide-react";

const PAGE_SIZE = 10;

function calcHallCost(c: Concert): number {
  if (!c.hallCostType || !c.hallCostValue) return 0;
  if (c.hallCostType === "percentage") return (c.price ?? 0) * c.hallCostValue / 100;
  return c.hallCostValue;
}

/* ── local date helpers (avoid UTC shift bug) ── */
function localStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalDateStr(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val.substring(0, 10);
  const obj = val as Record<string, unknown>;
  if (typeof obj.toDate === "function")
    return localStr((obj as { toDate: () => Date }).toDate());
  if (typeof obj.seconds === "number")
    return localStr(new Date((obj as { seconds: number }).seconds * 1000));
  return "";
}

function getWeekBounds(): [string, string] {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [localStr(mon), localStr(sun)];
}

function getMonthBounds(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [localStr(start), localStr(end)];
}


type StatusFilter = ConcertStatus4 | "all";
type DateFilter   = "all" | "today" | "week" | "month" | "custom";
type DateField    = "createdAt" | "date";

export default function FinancesPage() {
  const { feat } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter,   setDateFilter]   = useState<DateFilter>("all");
  const [dateField,    setDateField]    = useState<DateField>("createdAt");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    getConcerts().then((data) => { setConcerts(data); setLoading(false); });
  }, []);

  useEffect(() => { setPage(1); }, [statusFilter, dateFilter, dateField, dateFrom, dateTo, searchQuery]);

  const today                    = localStr(new Date());
  const [weekStart, weekEnd]     = getWeekBounds();
  const [monthStart, monthEnd]   = getMonthBounds();

  /* ── date filter ── */
  function passesDate(c: Concert): boolean {
    if (dateFilter === "all") return true;
    const d = toLocalDateStr(dateField === "createdAt" ? c.createdAt : c.date);
    if (!d) return false;
    if (dateFilter === "today")  return d === today;
    if (dateFilter === "week")   return d >= weekStart && d <= weekEnd;
    if (dateFilter === "month")  return d >= monthStart && d <= monthEnd;
    if (dateFilter === "custom") {
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    }
    return true;
  }

  /* concerts that pass the DATE filter (for status-tab counts) */
  const dateFiltered = concerts.filter(passesDate);

  /* search filter */
  function passesSearch(c: Concert): boolean {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const numQ = searchQuery.trim().replace(/^#/, "");
    if (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ)) return true;
    if ((c.clientName ?? "").toLowerCase().includes(q)) return true;
    if ((c.clientPhone ?? "").includes(searchQuery.trim())) return true;
    if ((c.clientPhone2 ?? "").includes(searchQuery.trim())) return true;
    if ((c.venueName ?? "").toLowerCase().includes(q)) return true;
    return false;
  }

  /* fully filtered — exclude cancelled concerts from financial view */
  const financial = dateFiltered.filter((c) => normalizeStatus(c.status) !== "cancelled");
  const filtered = financial
    .filter((c) => statusFilter === "all" || normalizeStatus(c.status) === statusFilter)
    .filter(passesSearch);

  const totalRevenue   = filtered.reduce((s, c) => s + (c.price ?? 0), 0);
  const totalCollected = filtered.reduce((s, c) => s + (c.deposit ?? 0), 0);
  const totalRemaining = totalRevenue - totalCollected;
  const totalHall      = filtered.reduce((s, c) => s + calcHallCost(c), 0);
  const totalTransport = filtered.reduce((s, c) => s + (c.transportCost ?? 0), 0);
  const totalExternal  = filtered.reduce((s, c) => s + (c.externalItemsCost ?? 0), 0);
  const totalLabor     = filtered.reduce((s, c) => s + (c.laborCost ?? 0), 0);
  const totalAllCosts  = totalHall + totalTransport + totalExternal + totalLabor;
  const netRevenue     = totalRevenue - totalHall - totalTransport - totalExternal - totalLabor;
  const rate           = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
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
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} من {concerts.length} حفلة
          </p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-[#1C2D50] flex items-center gap-1">
          لوحة التحكم <ChevronRight size={14} />
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالرقم التسلسلي، اسم العميل، الجوال، أو اسم المكان..."
          className="w-full border border-slate-200 rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        )}
      </div>

      {/* Date Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
            <CalendarDays size={15} className="text-[#1C2D50]" />
            {dateField === "createdAt" ? "فلتر بتاريخ الإنشاء" : "فلتر بتاريخ الحفلة"}
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setDateField("createdAt")}
              className={`px-3 py-1.5 transition-colors ${dateField === "createdAt" ? "bg-[#1C2D50] text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              تاريخ الإنشاء
            </button>
            <button
              onClick={() => setDateField("date")}
              className={`px-3 py-1.5 border-r border-slate-200 transition-colors ${dateField === "date" ? "bg-[#1C2D50] text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              تاريخ الحفلة
            </button>
          </div>
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
                  ? "bg-[#1C2D50] text-white"
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
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium whitespace-nowrap">إلى:</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
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
            {dateFilter === "today"  && `اليوم: ${today}`}
            {dateFilter === "week"   && `الأسبوع: ${weekStart} — ${weekEnd}`}
            {dateFilter === "month"  && `الشهر: ${monthStart} — ${monthEnd}`}
            {dateFilter === "custom" && dateFrom && dateTo && `النطاق: ${dateFrom} — ${dateTo}`}
            {" · "}
            <span className="font-semibold text-[#1C2D50]">{dateFiltered.length} حفلة</span>
          </p>
        )}
      </div>

      {/* Status Filter — counts reflect current date filter */}
      <div className="flex gap-2 flex-wrap">
        {/* الملغاة مستبعدة من القائمة المالية أصلاً، فلا شريحة لها */}
        {STATUS_FILTERS.filter((f) => f.key !== "cancelled").map((f) => {
          const count =
            f.key === "all"
              ? financial.length
              : financial.filter((c) => normalizeStatus(c.status) === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                statusFilter === f.key
                  ? "bg-[#1C2D50] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
              <span className="mr-1.5 text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Summary Cards */}
      {feat("finances", "totals") && <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-[#EEF1F7] rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-[#1C2D50]" />
            </div>
            <p className="text-xs text-slate-500">إجمالي الإيرادات</p>
          </div>
          <p className="text-2xl font-bold text-[#1C2D50]">{totalRevenue.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Wallet size={18} className="text-emerald-600" />
            </div>
            <p className="text-xs text-slate-500">إجمالي المحصَّل</p>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{totalCollected.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال ({rate}%)</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
              <Clock size={18} className="text-orange-600" />
            </div>
            <p className="text-xs text-slate-500">إجمالي المتبقي</p>
          </div>
          <p className="text-2xl font-bold text-orange-700">{totalRemaining.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-purple-600" />
            </div>
            <p className="text-xs text-slate-500">مصاريف القاعات</p>
          </div>
          <p className="text-2xl font-bold text-purple-700">{totalHall.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-slate-600" />
            </div>
            <p className="text-xs text-slate-500">مصاريف النقل</p>
          </div>
          <p className="text-2xl font-bold text-slate-700">{totalTransport.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <Package size={18} className="text-amber-600" />
            </div>
            <p className="text-xs text-slate-500">تكلفة المواد الخارجية</p>
          </div>
          <p className="text-2xl font-bold text-amber-700">{totalExternal.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
            <p className="text-xs text-slate-500">تكلفة العمالة</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">{totalLabor.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={18} className="text-teal-600" />
            </div>
            <p className="text-xs text-slate-500">الإيراد الصافي</p>
          </div>
          <p className="text-2xl font-bold text-teal-700">{netRevenue.toLocaleString("en-US")}</p>
          <p className="text-xs text-slate-400">ريال (بعد خصم جميع المصاريف)</p>
        </Card>
      </div>}

      {/* Collection Progress */}
      {feat("finances", "totals") && <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">نسبة التحصيل</h3>
          <span className={`text-xl font-bold ${rate >= 75 ? "text-emerald-600" : rate >= 40 ? "text-orange-500" : "text-red-500"}`}>
            {rate}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-700 ${rate >= 75 ? "bg-emerald-500" : rate >= 40 ? "bg-orange-400" : "bg-red-400"}`}
            style={{ width: `${rate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="text-emerald-600 font-semibold">{totalCollected.toLocaleString("en-US")} ريال محصَّل</span>
          <span className="text-orange-600 font-semibold">{totalRemaining.toLocaleString("en-US")} ريال متبقي</span>
        </div>
      </Card>}

      {/* Concerts Table */}
      {feat("finances", "table") && <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">تفاصيل الحفلات ({filtered.length})</h3>
          {totalPages > 1 && (
            <span className="text-xs text-slate-400">
              صفحة {safePage} من {totalPages}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
            <p>لا توجد حفلات تطابق الفلاتر المحددة</p>
            <button
              onClick={() => { setStatusFilter("all"); setDateFilter("all"); setDateFrom(""); setDateTo(""); setSearchQuery(""); }}
              className="mt-2 text-sm text-[#1C2D50] hover:underline"
            >
              مسح جميع الفلاتر
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="sm:hidden space-y-2">
              {paginated.map((c, idx) => {
                const hall = calcHallCost(c);
                const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                return (
                  <Link key={c.id} href={`/admin/concerts/${c.id}`}>
                    <div className={`rounded-xl p-4 hover:bg-slate-100 transition-all ${idx % 2 === 0 ? "bg-slate-50" : "bg-white border border-slate-100"}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                          <p className="text-xs text-slate-400">{formatDate(dateField === "createdAt" ? c.createdAt : c.date)}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white/70 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">السعر</p>
                          <p className="font-bold text-slate-800">{(c.price ?? 0).toLocaleString("en-US")}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">المحصَّل</p>
                          <p className="font-bold text-emerald-700">{(c.deposit ?? 0).toLocaleString("en-US")}</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">المتبقي</p>
                          <p className="font-bold text-orange-700">{remaining.toLocaleString("en-US")}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">القاعة + النقل</p>
                          <p className="font-bold text-purple-700">{(hall + (c.transportCost ?? 0)).toLocaleString("en-US")}</p>
                        </div>
                        {(c.externalItemsCost ?? 0) > 0 && (
                          <div className="bg-amber-50 rounded-lg px-2 py-1.5">
                            <p className="text-slate-400">مواد خارجية</p>
                            <p className="font-bold text-amber-600">{c.externalItemsCost!.toLocaleString("en-US")}</p>
                          </div>
                        )}
                        {(c.laborCost ?? 0) > 0 && (
                          <div className="bg-blue-50 rounded-lg px-2 py-1.5">
                            <p className="text-slate-400">عمالة</p>
                            <p className="font-bold text-blue-600">{c.laborCost!.toLocaleString("en-US")}</p>
                          </div>
                        )}
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
                  <tr className="border-b-2 border-slate-200">
                    {["العميل", dateField === "createdAt" ? "تاريخ الإنشاء" : "تاريخ الحفلة", "الحالة", "السعر", "القاعة", "النقل", "مواد خارجية", "عمالة", "مجموع التكاليف", "المحصَّل", "المتبقي"].map((h) => (
                      <th key={h} className="text-right text-xs font-semibold text-slate-500 pb-3 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, idx) => {
                    const hall = calcHallCost(c);
                    const remaining = (c.price ?? 0) - (c.deposit ?? 0);
                    const concertTotalCosts = hall + (c.transportCost ?? 0) + (c.externalItemsCost ?? 0) + (c.laborCost ?? 0);
                    const isShaded = idx % 2 === 0;
                    return (
                      <tr key={c.id} className={`transition-colors hover:bg-slate-100 ${isShaded ? "bg-slate-50" : "bg-white"}`}>
                        <td className="py-3.5 px-3">
                          <Link href={`/admin/concerts/${c.id}`} className="font-semibold text-slate-800 hover:text-[#1C2D50] transition-colors">
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 text-xs">{formatDate(dateField === "createdAt" ? c.createdAt : c.date)}</td>
                        <td className="py-3.5 px-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
                            {statusLabel(c.status)}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-800">{(c.price ?? 0).toLocaleString("en-US")}</td>
                        <td className="py-3.5 px-3 text-purple-700">{hall > 0 ? hall.toLocaleString("en-US") : "—"}</td>
                        <td className="py-3.5 px-3 text-slate-600">{c.transportCost ? c.transportCost.toLocaleString("en-US") : "—"}</td>
                        <td className="py-3.5 px-3 text-amber-600">{c.externalItemsCost ? c.externalItemsCost.toLocaleString("en-US") : "—"}</td>
                        <td className="py-3.5 px-3 text-blue-600">{c.laborCost ? c.laborCost.toLocaleString("en-US") : "—"}</td>
                        <td className="py-3.5 px-3">
                          <span className={`font-bold text-sm px-2 py-0.5 rounded-lg ${concertTotalCosts > 0 ? "bg-red-50 text-red-700" : "text-slate-400"}`}>
                            {concertTotalCosts > 0 ? concertTotalCosts.toLocaleString("en-US") : "—"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-bold text-emerald-700">{(c.deposit ?? 0).toLocaleString("en-US")}</td>
                        <td className="py-3.5 px-3">
                          <span className={`font-bold ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                            {remaining.toLocaleString("en-US")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-[#EEF1F7]">
                    <td colSpan={3} className="py-3 px-3 font-bold text-slate-700 text-xs">
                      الإجمالي الكلي ({filtered.length} حفلة)
                    </td>
                    <td className="py-3 px-3 font-bold text-[#1C2D50]">{totalRevenue.toLocaleString("en-US")}</td>
                    <td className="py-3 px-3 font-bold text-purple-700">{totalHall > 0 ? totalHall.toLocaleString("en-US") : "—"}</td>
                    <td className="py-3 px-3 font-bold text-slate-700">{totalTransport > 0 ? totalTransport.toLocaleString("en-US") : "—"}</td>
                    <td className="py-3 px-3 font-bold text-amber-600">{totalExternal > 0 ? totalExternal.toLocaleString("en-US") : "—"}</td>
                    <td className="py-3 px-3 font-bold text-blue-600">{totalLabor > 0 ? totalLabor.toLocaleString("en-US") : "—"}</td>
                    <td className="py-3 px-3">
                      <span className={`font-bold text-sm px-2 py-0.5 rounded-lg ${totalAllCosts > 0 ? "bg-red-100 text-red-700" : "text-slate-400"}`}>
                        {totalAllCosts > 0 ? totalAllCosts.toLocaleString("en-US") : "—"}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-emerald-700">{totalCollected.toLocaleString("en-US")}</td>
                    <td className="py-3 px-3 font-bold text-orange-700">{totalRemaining.toLocaleString("en-US")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={15} />
                  السابق
                </button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const isActive = p === safePage;
                    const isNear = Math.abs(p - safePage) <= 1 || p === 1 || p === totalPages;
                    if (!isNear) {
                      if (p === 2 && safePage > 3) return <span key={p} className="text-slate-400 text-sm px-1">…</span>;
                      if (p === totalPages - 1 && safePage < totalPages - 2) return <span key={p} className="text-slate-400 text-sm px-1">…</span>;
                      return null;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded-xl text-sm font-semibold transition-colors ${
                          isActive
                            ? "bg-[#1C2D50] text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  التالي
                  <ChevronLeft size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </Card>}
    </div>
  );
}

