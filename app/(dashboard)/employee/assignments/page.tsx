"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsByEmployee, getConcerts, getConcertItems } from "@/lib/firestore/concerts";
import { getConcertFood } from "@/lib/firestore/food";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Concert } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState, tsToDateStr } from "@/components/ui/list-filters";
import { Package, UtensilsCrossed, Music, CalendarDays, Clock, MapPin, ChevronLeft } from "lucide-react";

const PAGE_SIZE = 10;

interface ConcertSummary {
  concert: Concert;
  materialsCount: number;
  foodCount: number;
}

// Employees are pure VIEWERS: a grid of concert cards; clicking one opens an
// organized read-only detail page.
export default function EmployeeAssignmentsPage() {
  const { appUser, can } = useAuth();
  const { showToast } = useToast();
  const [summaries, setSummaries] = useState<ConcertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [timeFilter, setTimeFilter] = useState<"" | "upcoming" | "past">("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, dateF, timeFilter]);

  // Admin and custom roles granted "employees" oversee all concerts
  const isAdmin = appUser?.role === "admin" || (appUser?.role === "custom" && can("employees"));
  const pageAllowed = isAdmin || appUser?.role === "employee";

  useEffect(() => {
    async function load() {
      if (!appUser) return;
      setLoading(true);
      try {
        const concerts = isAdmin
          ? await getConcerts()
          : await getConcertsByEmployee(appUser.uid);
        const data = await Promise.all(
          concerts.map(async (concert) => {
            const [items, food] = await Promise.all([
              getConcertItems(concert.id).catch(() => []),
              getConcertFood(concert.id).catch(() => []),
            ]);
            return {
              concert,
              materialsCount: items.reduce((s, i) => s + (i.count ?? 0), 0),
              foodCount: food.reduce((s, f) => s + (f.quantity ?? 0), 0),
            };
          })
        );
        setSummaries(data);
      } catch {
        showToast("حدث خطأ أثناء تحميل البيانات", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const todayStr = tsToDateStr({ toDate: () => new Date() });
  const q = search.trim().toLowerCase();
  const numQ = search.trim().replace(/^#/, "");
  const filtered = summaries.filter(({ concert: c }) => {
    const dStr = tsToDateStr(c.date);
    if (timeFilter === "upcoming" && dStr < todayStr) return false;
    if (timeFilter === "past" && dStr >= todayStr) return false;
    if (!matchesDate(c.date, dateF)) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.venueName ?? "").toLowerCase().includes(q) ||
      (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "حفلات الموظفين" : "حفلاتي"}</h2>
        <p className="text-sm text-slate-500">{filtered.length} حفلة — اضغط على الحفلة لعرض تفاصيلها</p>
      </div>

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="بحث بالرقم التسلسلي، اسم الحفلة، أو المكان..."
      />

      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={filtered.length} unitLabel="حفلة" />

      {/* Own filter: upcoming vs past */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "", label: "الكل" },
          { key: "upcoming", label: "القادمة" },
          { key: "past", label: "السابقة" },
        ] as { key: "" | "upcoming" | "past"; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setTimeFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              timeFilter === f.key
                ? "bg-[#1C2D50] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Music size={40} className="mb-3 opacity-40" />
          <p>{summaries.length === 0 ? "لا توجد حفلات مسندة إليك" : "لا توجد نتائج مطابقة"}</p>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map(({ concert, materialsCount, foodCount }) => (
            <Link key={concert.id} href={`/employee/assignments/${concert.id}`}>
              <Card className="hover:shadow-md hover:border-[#D4DCE8] transition-all cursor-pointer h-full">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-bold text-slate-800 text-base truncate">{concert.name}</h3>
                  {concert.concertNumber != null && (
                    <span className="text-xs font-bold bg-[#1C2D50] text-[#D4DCE8] px-2.5 py-1 rounded-full shrink-0">
                      #{String(concert.concertNumber).padStart(3, "0")}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-slate-500">
                  <p className="flex items-center gap-1.5 tabular-nums-auto">
                    <CalendarDays size={13} className="text-[#1C2D50] shrink-0" />
                    {formatDate(concert.date)}
                  </p>
                  <p className="flex items-center gap-1.5 font-bold text-[#1C2D50] tabular-nums-auto">
                    <Clock size={13} className="shrink-0" />
                    {formatTime(concert.date)}
                  </p>
                  {concert.venueName && (
                    <p className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{concert.venueName}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <div className="flex gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[11px] px-2 py-0.5 rounded-full font-semibold tabular-nums-auto">
                      <Package size={11} /> {materialsCount} مادة
                    </span>
                    <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-[11px] px-2 py-0.5 rounded-full font-semibold tabular-nums-auto">
                      <UtensilsCrossed size={11} /> {foodCount} صنف
                    </span>
                  </div>
                  <ChevronLeft size={16} className="text-slate-300" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
