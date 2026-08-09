"use client";

/* حفلات المشرف المسندة إليه. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsBySupervisor, getConcerts } from "@/lib/firestore/concerts";
import { getUsersByRole } from "@/lib/firestore/users";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Concert, AppUser } from "@/types";
import { formatDate } from "@/lib/utils";
import { STATUS_FILTERS, normalizeStatus } from "@/lib/concert-status";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { Music, Calendar, MapPin, UserCog, UserRound, UsersRound } from "lucide-react";

const PAGE_SIZE = 10;

export default function SupervisorConcertsPage() {
  const { appUser, can } = useAuth();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [supFilter, setSupFilter] = useState(""); // admin: focus on one supervisor
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [filterStatus, supFilter, search, dateF]);

  // Admin and custom roles granted the "supervisor" page oversee everything;
  // real supervisors see their own concerts only.
  const isAdmin = appUser?.role === "admin" || (appUser?.role === "custom" && can("supervisor"));
  const pageAllowed = isAdmin || appUser?.role === "supervisor";

  useEffect(() => {
    if (!appUser) return;
    async function load() {
      try {
        if (isAdmin) {
          // The admin supervises everything — plus the people lists for filtering
          const [all, sups, emps] = await Promise.all([
            getConcerts(),
            getUsersByRole("supervisor").catch(() => []),
            getUsersByRole("employee").catch(() => []),
          ]);
          setConcerts(all);
          setSupervisors(sups);
          setEmployees(emps);
        } else {
          setConcerts(await getConcertsBySupervisor(appUser!.uid));
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  const q = search.trim().toLowerCase();
  const numQ = search.trim().replace(/^#/, "");
  const filtered = concerts.filter(
    (c) =>
      (!filterStatus || normalizeStatus(c.status) === filterStatus) &&
      (!supFilter || (c.supervisorIds ?? []).includes(supFilter)) &&
      matchesDate(c.date, dateF) &&
      (!q ||
        c.name.toLowerCase().includes(q) ||
        (c.clientName ?? "").toLowerCase().includes(q) ||
        (c.venueName ?? "").toLowerCase().includes(q) ||
        (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ)))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // The focused supervisor's team = union of employees across his concerts
  const focusedSupervisor = supervisors.find((s) => s.uid === supFilter) ?? null;
  const focusedEmployeeIds = focusedSupervisor
    ? [...new Set(filtered.flatMap((c) => c.employeeIds))]
    : [];
  const focusedEmployees = employees.filter((e) => focusedEmployeeIds.includes(e.uid));

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "حفلات المشرفين" : "حفلاتي"}</h2>
        <p className="text-sm text-slate-500">{concerts.length} حفلة{isAdmin ? " — صلاحيات المشرف الكاملة" : ""}</p>
      </div>

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="بحث بالرقم التسلسلي، اسم الحفلة، العميل، أو المكان..."
      />

      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={filtered.length} unitLabel="حفلة" />

      {/* Admin: pick a supervisor to focus on his concerts and team */}
      {isAdmin && supervisors.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSupFilter("")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              supFilter === "" ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <UserCog size={13} /> كل المشرفين
          </button>
          {supervisors.map((s) => (
            <button
              key={s.uid}
              onClick={() => setSupFilter(s.uid)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                supFilter === s.uid ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Focused supervisor summary: his concerts count + his team */}
      {isAdmin && focusedSupervisor && (
        <Card className="border-[#D4DCE8]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] font-bold text-sm shrink-0">
              {focusedSupervisor.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">{focusedSupervisor.name}</p>
              <p className="text-xs text-slate-400">{filtered.length} حفلة تحت إشرافه</p>
            </div>
          </div>
          <p className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1">
            <UserRound size={11} /> موظفوه في هذه الحفلات ({focusedEmployees.length})
          </p>
          {focusedEmployees.length === 0 ? (
            <p className="text-xs text-slate-400">لا يوجد موظفون مسندون بعد</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {focusedEmployees.map((e) => (
                <span key={e.uid} className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">
                  <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-[9px] font-bold">
                    {e.name.charAt(0)}
                  </span>
                  {e.name}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilterStatus(f.key === "all" ? "" : f.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${(filterStatus || "all") === f.key ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {f.label}
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
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {paginated.map((concert) => (
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
                  {concert.peopleCount && (
                    <div className="flex items-center gap-2"><UsersRound size={13} className="shrink-0" /><span className="line-clamp-1">{concert.peopleCount}</span></div>
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
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
