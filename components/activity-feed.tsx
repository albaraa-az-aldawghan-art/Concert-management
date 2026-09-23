"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { ActivityEntry, ActivityStatus } from "@/lib/activity";
import { Card } from "@/components/ui/card";

const statuses: Record<ActivityStatus, { label: string; color: string }> = {
  success: { label: "تم التنفيذ", color: "bg-emerald-50 text-emerald-700" },
  failed: { label: "لم يكتمل الطلب", color: "bg-red-50 text-red-700" },
  pending: { label: "النتيجة غير مؤكدة", color: "bg-amber-50 text-amber-700" },
  interaction: { label: "تفاعل بالواجهة", color: "bg-blue-50 text-blue-700" },
};
type Result = { entries: ActivityEntry[]; nextCursor: string | null };

export function ActivityFeed({ full = false }: { full?: boolean }) {
  const { can } = useAuth();
  const allowed = can("activity");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState("");
  const generation = useRef(0);
  const load = useCallback(async (after?: string, quiet = false) => {
    if (!allowed) return;
    const request = ++generation.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(filters);
      params.set("limit", full ? "30" : "5");
      if (after) params.set("cursor", after);
      const result = await api.get<Result>(`/api/activity?${params}`);
      if (request !== generation.current) return;
      setEntries((old) => after ? [...old, ...result.entries.filter((entry) => !old.some((v) => v.id === entry.id))] : result.entries);
      setCursor(result.nextCursor);
    } catch (e) {
      if (request === generation.current) {
        setEntries([]);
        setCursor(null);
        setError(e instanceof Error ? e.message : "تعذر تحميل السجل");
      }
    } finally { if (request === generation.current) setLoading(false); }
  }, [allowed, filters, full]);

  useEffect(() => {
    const requests = generation;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = !full ? window.setInterval(() => { if (document.visibilityState === "visible") void load(undefined, true); }, 15000) : null;
    return () => { requests.current++; clearTimeout(initial); if (timer) clearInterval(timer); };
  }, [load, full]);

  if (!allowed) return null;
  return <Card className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><History size={20} />{full ? "سجل النشاطات" : "آخر النشاطات"}</h2>
      <div className="flex items-center gap-3">
        <button type="button" disabled={loading} onClick={() => void load()} aria-label="تحديث سجل النشاطات" className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
        {!full && <Link className="text-sm font-semibold text-blue-600 hover:underline" href="/admin/activity">مشاهدة الكل</Link>}
      </div>
    </div>
    {full && <form className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3" onSubmit={(event) => {
      event.preventDefault();
      if (from && to && from > to) { setError("تاريخ البداية يجب أن يسبق تاريخ النهاية"); return; }
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (status) params.set("status", status);
      if (from) params.set("from", `${from}T00:00:00+03:00`);
      if (to) params.set("to", `${to}T23:59:59.999+03:00`);
      if (params.toString() === filters) void load();
      else setFilters(params.toString());
    }}>
      <label className="text-xs text-slate-500">المستخدم أو الإجراء<input className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} placeholder="الاسم، البريد، الإجراء…" /></label>
      <label className="text-xs text-slate-500">نوع النشاط<select className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل النشاطات</option>{Object.entries(statuses).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
      <label className="text-xs text-slate-500">من تاريخ<input type="date" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-xs text-slate-500">إلى تاريخ<input type="date" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button disabled={loading} className="self-end rounded-lg bg-[#1C2D50] text-white p-2 flex justify-center gap-2 disabled:opacity-50"><Search size={17} />تصفية</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading && entries.length === 0 && <p role="status" className="py-6 text-center text-slate-500">جارٍ تحميل النشاطات…</p>}
    {!loading && !error && entries.length === 0 && <p className="py-6 text-center text-slate-500">لا توجد نشاطات مطابقة{cursor ? " في هذه الدفعة. تابع لعرض الأقدم." : "."}</p>}
    <ol className="divide-y divide-slate-100">
      {entries.map((entry) => <li key={entry.id} className="py-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-700">{entry.actorName || "مستخدم"}</span><span className={`text-xs rounded-full px-2 py-1 ${statuses[entry.status]?.color}`}>{statuses[entry.status]?.label}</span></div>
        <p className="text-xs text-slate-500 break-all">{entry.actorEmail || entry.actorId}</p>
        <p className="font-bold text-[#1C2D50] break-words">{entry.action}</p>
        <time className="block text-xs text-slate-500" dateTime={entry.createdAt}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "medium", calendar: "gregory" }) : "—"}</time>
        {full && entry.targetId && <p className="text-xs text-slate-400 break-all">مرجع العملية: <bdi>{entry.targetId}</bdi></p>}
      </li>)}
    </ol>
    {full && cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)} className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold disabled:opacity-50">{loading ? "جارٍ التحميل…" : "عرض المزيد"}</button>}
    {full && <p className="text-xs text-slate-400">الأوقات بتوقيت الرياض. تفاعل الواجهة يسجّل الضغط ولا يعني نجاح العملية. يبدأ السجل من تفعيل الميزة.</p>}
  </Card>;
}
