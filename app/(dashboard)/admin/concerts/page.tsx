"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcerts, deleteConcert } from "@/lib/firestore/concerts";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { Concert } from "@/types";
import { formatDate } from "@/lib/utils";
import {
  Plus, Music, CalendarDays, Search, Hash,
  Trash2, Eye, ChevronRight, ChevronLeft, AlertCircle, MapPin, Users,
} from "lucide-react";

type StatusFilter = "all" | "planned" | "confirmed" | "materials_requested" | "active" | "location_set" | "executing" | "materials_returned" | "delivered_to_warehouse" | "warehouse_confirmed" | "completed";
type DateFilter   = "all" | "today" | "week" | "month" | "custom";
type DateField    = "createdAt" | "date";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  planned:                "غير مؤكدة",
  confirmed:              "مؤكدة",
  materials_requested:    "طلب المواد",
  active:                 "استلام المواد",
  location_set:           "تحديد الموقع",
  executing:              "تنفيذ الحفلة",
  materials_returned:     "استلام مواد الحفلة",
  delivered_to_warehouse: "تسليم للمخزن",
  warehouse_confirmed:    "تأكيد المخزن",
  completed:              "مكتملة",
};
const STATUS_COLOR: Record<string, string> = {
  planned:                "bg-yellow-100 text-yellow-700",
  confirmed:              "bg-green-100 text-green-700",
  materials_requested:    "bg-indigo-100 text-indigo-700",
  active:                 "bg-[#D4DCE8] text-[#1C2D50]",
  location_set:           "bg-indigo-100 text-indigo-700",
  executing:              "bg-emerald-100 text-emerald-700",
  materials_returned:     "bg-orange-100 text-orange-700",
  delivered_to_warehouse: "bg-orange-100 text-orange-700",
  warehouse_confirmed:    "bg-blue-100 text-blue-700",
  completed:              "bg-slate-100 text-slate-500",
};

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateStr(val: unknown): string {
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
  return [
    localStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    localStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  ];
}

export default function AdminConcertsPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const canManage = can("concerts", "manage");
  const [concerts, setConcerts]     = useState<Concert[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Concert | null>(null);
  const [saving, setSaving]         = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter]   = useState<DateFilter>("all");
  const [dateField, setDateField]     = useState<DateField>("createdAt");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage]               = useState(1);

  useEffect(() => { loadConcerts(); }, []);
  useEffect(() => { setPage(1); }, [statusFilter, dateFilter, dateField, dateFrom, dateTo, searchQuery]);

  async function loadConcerts() {
    setLoading(true);
    const data = await getConcerts();
    setConcerts(data);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteConcert(deleteTarget.id);
      showToast("تم حذف الحفلة");
      setDeleteTarget(null);
      loadConcerts();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  const today                  = localStr(new Date());
  const [weekStart, weekEnd]   = getWeekBounds();
  const [monthStart, monthEnd] = getMonthBounds();

  /* ── فلتر التاريخ ── */
  function passesDate(c: Concert): boolean {
    if (dateFilter === "all") return true;
    const d = toDateStr(dateField === "createdAt" ? c.createdAt : c.date);
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

  const dateFiltered = concerts.filter(passesDate);

  function passesSearch(c: Concert): boolean {
    if (!searchQuery.trim()) return true;
    const q    = searchQuery.trim().toLowerCase();
    const numQ = searchQuery.trim().replace(/^#/, "");
    if (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ)) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if ((c.clientName  ?? "").toLowerCase().includes(q)) return true;
    if ((c.clientPhone ?? "").includes(searchQuery.trim())) return true;
    if ((c.clientPhone2 ?? "").includes(searchQuery.trim())) return true;
    if ((c.venueName   ?? "").toLowerCase().includes(q)) return true;
    return false;
  }

  const filtered = dateFiltered
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter(passesSearch);

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
            <Music size={22} className="text-[#1C2D50]" />
            الحفلات
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} من {concerts.length} حفلة
          </p>
        </div>
        {canManage && (
          <Link href="/admin/concerts/new">
            <Button>
              <Plus size={16} />
              حفلة جديدة
            </Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالرقم التسلسلي، اسم الحفلة، العميل، الجوال، أو اسم المكان..."
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
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium whitespace-nowrap">إلى:</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-slate-400 hover:text-red-500 transition-colors">مسح</button>
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

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "all",                    label: "الكل" },
          { key: "planned",                label: "غير مؤكدة" },
          { key: "confirmed",              label: "مؤكدة" },
          { key: "materials_requested",    label: "طلب المواد" },
          { key: "active",                 label: "استلام المواد" },
          { key: "location_set",           label: "تحديد الموقع" },
          { key: "executing",              label: "تنفيذ الحفلة" },
          { key: "materials_returned",     label: "استلام مواد الحفلة" },
          { key: "delivered_to_warehouse", label: "تسليم للمخزن" },
          { key: "warehouse_confirmed",    label: "تأكيد المخزن" },
          { key: "completed",              label: "مكتملة" },
        ] as { key: StatusFilter; label: string }[]).map((f) => {
          const count = f.key === "all"
            ? dateFiltered.length
            : dateFiltered.filter((c) => c.status === f.key).length;
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

      {/* Table Card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">قائمة الحفلات ({filtered.length})</h3>
          {totalPages > 1 && (
            <span className="text-xs text-slate-400">صفحة {safePage} من {totalPages}</span>
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
              {paginated.map((c, idx) => (
                <div key={c.id} className={`rounded-xl p-4 ${idx % 2 === 0 ? "bg-slate-50" : "bg-white border border-slate-100"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {c.concertNumber != null && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold bg-[#1C2D50] text-[#D4DCE8] px-1.5 py-0.5 rounded-full">
                            <Hash size={9} />{String(c.concertNumber).padStart(3, "0")}
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm truncate">{c.name}</p>
                      {c.clientName && <p className="text-xs text-slate-400">{c.clientName}</p>}
                    </div>
                    <div className="flex gap-1 mr-1">
                      <Link href={`/admin/concerts/${c.id}`}
                        className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors">
                        <Eye size={14} />
                      </Link>
                      {canManage && (
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={11} />{formatDate(dateField === "createdAt" ? c.createdAt : c.date)}
                    </span>
                    {c.venueName && (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />{c.venueName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users size={11} />{c.supervisorIds.length} مشرف · {c.employeeIds.length} موظف
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    {["#", "الحفلة", dateField === "createdAt" ? "تاريخ الإنشاء" : "تاريخ الحفلة", "المكان", "الحالة", "الفريق", ""].map((h) => (
                      <th key={h} className="text-right text-xs font-semibold text-slate-500 pb-3 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, idx) => {
                    const isShaded = idx % 2 === 0;
                    return (
                      <tr key={c.id} className={`transition-colors hover:bg-slate-100 ${isShaded ? "bg-slate-50" : "bg-white"}`}>
                        <td className="py-3.5 px-3">
                          {c.concertNumber != null ? (
                            <span className="inline-flex items-center gap-0.5 text-xs font-bold bg-[#1C2D50] text-[#D4DCE8] px-2 py-0.5 rounded-full">
                              <Hash size={9} />{String(c.concertNumber).padStart(3, "0")}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-3.5 px-3">
                          <Link href={`/admin/concerts/${c.id}`} className="font-semibold text-slate-800 hover:text-[#1C2D50] transition-colors block">
                            {c.name}
                          </Link>
                          {c.clientName && <p className="text-xs text-slate-400 mt-0.5">{c.clientName}</p>}
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(dateField === "createdAt" ? c.createdAt : c.date)}</td>
                        <td className="py-3.5 px-3 text-slate-600 text-xs max-w-[140px]">
                          <span className="line-clamp-1">{c.venueName || c.location?.address || "—"}</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {c.supervisorIds.length} مشرف · {c.employeeIds.length} موظف
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link href={`/admin/concerts/${c.id}`}
                              className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors">
                              <Eye size={14} />
                            </Link>
                            {canManage && (
                              <button onClick={() => setDeleteTarget(c)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-[#EEF1F7]">
                    <td colSpan={7} className="py-3 px-3 text-xs font-bold text-slate-700">
                      الإجمالي الكلي: {filtered.length} حفلة
                    </td>
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
                    const isNear   = Math.abs(p - safePage) <= 1 || p === 1 || p === totalPages;
                    if (!isNear) {
                      if (p === 2 && safePage > 3)                   return <span key={p} className="text-slate-400 text-sm px-1">…</span>;
                      if (p === totalPages - 1 && safePage < totalPages - 2) return <span key={p} className="text-slate-400 text-sm px-1">…</span>;
                      return null;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded-xl text-sm font-semibold transition-colors ${
                          isActive ? "bg-[#1C2D50] text-white" : "text-slate-600 hover:bg-slate-100"
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
      </Card>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الحفلة"
        message={`هل أنت متأكد من حذف حفلة "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
