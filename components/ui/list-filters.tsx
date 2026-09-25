"use client";

/* أدوات القوائم المشتركة: بحث وفلتر تاريخ وترقيم صفحات وفلترة/فرز الأعمدة. */
import { Search, CalendarDays, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import { compareEventDates, eventDateString } from "@/lib/event-date";

export const tsToDateStr = eventDateString;
export const compareDateValues = compareEventDates;

/* ═══════════════════════════════════════════════════════════════
   Shared list controls — the same design language as the concerts
   page: search box, date filter card (today/week/month/custom) and
   numbered pagination. Used across orders/requests/missing pages.
   ═══════════════════════════════════════════════════════════════ */

export type DateMode = "all" | "today" | "week" | "month" | "custom";
export interface DateFilterState {
  mode: DateMode;
  from: string;
  to: string;
}
export const emptyDateFilter: DateFilterState = { mode: "all", from: "", to: "" };

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekBounds(): [string, string] {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [localStr(mon), localStr(sun)];
}

function monthBounds(): [string, string] {
  const now = new Date();
  return [
    localStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    localStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  ];
}

export function matchesDate(val: unknown, f: DateFilterState): boolean {
  if (f.mode === "all") return true;
  const d = tsToDateStr(val);
  if (!d) return false;
  if (f.mode === "today") return d === localStr(new Date());
  if (f.mode === "week") {
    const [ws, we] = weekBounds();
    return d >= ws && d <= we;
  }
  if (f.mode === "month") {
    const [ms, me] = monthBounds();
    return d >= ms && d <= me;
  }
  if (f.mode === "custom") {
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    return true;
  }
  return true;
}

/* ── Search box ── */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-11 border border-slate-200 rounded-xl pr-9 pl-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#EEF1F7] focus:border-[#1C2D50] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="مسح البحث"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ── Date filter card ── */
export function DateFilterBar({
  value,
  onChange,
  title = "فلتر بتاريخ الحفلة",
  matchedCount,
  unitLabel = "نتيجة",
}: {
  value: DateFilterState;
  onChange: (v: DateFilterState) => void;
  title?: string;
  matchedCount?: number;
  unitLabel?: string;
}) {
  const [ws, we] = weekBounds();
  const [ms, me] = monthBounds();
  const today = localStr(new Date());

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
        <CalendarDays size={15} className="text-[#1C2D50]" />
        {title}
      </div>
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "all", label: "الكل" },
          { key: "today", label: "اليوم" },
          { key: "week", label: "هذا الأسبوع" },
          { key: "month", label: "هذا الشهر" },
          { key: "custom", label: "نطاق مخصص" },
        ] as { key: DateMode; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => onChange({ ...value, mode: f.key })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              value.mode === f.key
                ? "bg-[#1C2D50] text-white"
                : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {value.mode === "custom" && (
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">من:</label>
            <input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">إلى:</label>
            <input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
            />
          </div>
          {(value.from || value.to) && (
            <button
              onClick={() => onChange({ ...value, from: "", to: "" })}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              مسح
            </button>
          )}
        </div>
      )}

      {value.mode !== "all" && (
        <p className="text-xs text-slate-400">
          {value.mode === "today" && `اليوم: ${today}`}
          {value.mode === "week" && `الأسبوع: ${ws} — ${we}`}
          {value.mode === "month" && `الشهر: ${ms} — ${me}`}
          {value.mode === "custom" && value.from && value.to && `النطاق: ${value.from} — ${value.to}`}
          {matchedCount !== undefined && (
            <>
              {" · "}
              <span className="font-semibold text-[#1C2D50]">
                {matchedCount} {unitLabel}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/* ── رأس عمود قابل للفرز — نفس نمط صفحة رصيد الأصناف، معمَّم لأي مفتاح فرز ── */
export function SortHeader<K extends string>({
  label, sortKeyName, activeKey, dir, onSort,
}: {
  label: string;
  sortKeyName: K;
  activeKey: K | null;
  dir: "asc" | "desc";
  onSort: (key: K) => void;
}) {
  const active = activeKey === sortKeyName;
  return (
    <button type="button" onClick={() => onSort(sortKeyName)}
      className={`flex items-center gap-1 font-semibold transition-colors whitespace-nowrap ${active ? "text-[#1C2D50]" : "hover:text-slate-700"}`}>
      {label}
      {active ? (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} className="opacity-30" />}
    </button>
  );
}

/** حقلا من/إلى مضغوطان لعمود رقمي واحد */
export function RangeFilter({ min, max, onMin, onMax }: { min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" value={min} onChange={(e) => onMin(e.target.value)} placeholder="من"
        className="w-14 border border-slate-200 rounded-md px-1.5 py-1 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-[#1C2D50]" />
      <span className="text-slate-300 text-[10px]">–</span>
      <input type="number" value={max} onChange={(e) => onMax(e.target.value)} placeholder="إلى"
        className="w-14 border border-slate-200 rounded-md px-1.5 py-1 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-[#1C2D50]" />
    </div>
  );
}

/** فلتر نصّي مضغوط لعمود — نفس مظهر أعمدة الفلترة الأخرى */
export function TextFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-[#1C2D50]" />
  );
}

export function inRange(val: number, min: string, max: string): boolean {
  if (min !== "" && val < parseFloat(min)) return false;
  if (max !== "" && val > parseFloat(max)) return false;
  return true;
}

/** زر "مسح الفلاتر" — يظهر فقط لو فيه فلتر فعّال */
export function ClearFiltersButton({ show, onClear }: { show: boolean; onClear: () => void }) {
  if (!show) return null;
  return (
    <button onClick={onClear} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors w-fit">
      <X size={13} /> مسح الفلاتر
    </button>
  );
}

/* ── Numbered pagination (max 10 rows/page pattern) ── */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Windowed page numbers: always show first/last, window around current
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 pt-4 flex-wrap">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={15} />
        السابق
      </button>

      <div className="flex gap-1">
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-2 py-2 text-slate-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`min-w-[36px] px-2 py-2 rounded-xl text-sm font-semibold transition-colors tabular-nums-auto ${
                p === page
                  ? "bg-[#1C2D50] text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        التالي
        <ChevronLeft size={15} />
      </button>
    </div>
  );
}
