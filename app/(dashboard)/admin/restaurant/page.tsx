"use client";

/* المطعم: تكاليفه تُحسب على أساس ما صُرف له شهرياً — مجاميع كل شهر
   وتفصيل كل صنف، مع إمكانية تسجيل الصرف في أي وقت. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Actor } from "@/components/ui/actor";
import { getCostOutgoing, getCostSettings, getCostItems } from "@/lib/firestore/costs";
import { getSectionsOfChannel, itemsOfSection } from "@/lib/firestore/sales";
import { CostOutgoing, CostSettings, CostItem, SalesSection } from "@/types";
import {
  UtensilsCrossed, ChevronRight, ChevronLeft, PackageMinus, Info,
  TrendingDown, Layers, Plus,
} from "lucide-react";

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** yyyy-mm-dd ← الشهر والسنة بلا انزياح منطقة زمنية */
function ym(dateStr: string | undefined, fallback?: { seconds: number }) {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { y: +dateStr.slice(0, 4), m: +dateStr.slice(5, 7) - 1 };
  }
  if (fallback?.seconds) {
    const d = new Date(fallback.seconds * 1000);
    return { y: d.getFullYear(), m: d.getMonth() };
  }
  return null;
}

export default function RestaurantPage() {
  const { appUser, can, feat } = useAuth();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("restaurant"));
  const canDispense = isAdmin || feat("costs", "out_add");

  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [] });
  const [items, setItems] = useState<CostItem[]>([]);
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [o, s, i, sec] = await Promise.all([
      getCostOutgoing().catch(() => [] as CostOutgoing[]),
      getCostSettings().catch(() => ({ units: [], departments: [] } as CostSettings)),
      getCostItems().catch(() => [] as CostItem[]),
      getSectionsOfChannel("restaurant").catch(() => [] as SalesSection[]),
    ]);
    setOutgoing(o);
    setSettings(s);
    setItems(i);
    setSections(sec);
    setLoading(false);
  }

  /** أقسام المطعم: ما عُلِّم «مطعم»، وإلا فكل قسم غير مرتبط بحفلة ولا عقد.
   *  الافتراض الثاني يجعل الصفحة مفيدة قبل ضبط الإعدادات. */
  const restaurantDepts = useMemo(() => {
    const flagged = settings.departments.filter((d) => d.restaurant);
    if (flagged.length) return new Set(flagged.map((d) => d.name));
    return new Set(
      settings.departments.filter((d) => !d.concertLinked && !d.contractLinked).map((d) => d.name)
    );
  }, [settings]);

  /** صرف المطعم: لا حفلة ولا عقد، وقسمه من أقسام المطعم */
  const restaurantOut = outgoing.filter(
    (o) => !o.concertId && !o.contractId && !o.manualConcertName && restaurantDepts.has(o.departmentName)
  );

  /* مجاميع السنة شهراً بشهر */
  const monthly = Array.from({ length: 12 }, () => ({ total: 0, count: 0 }));
  for (const o of restaurantOut) {
    const t = ym(o.dispenseDate, o.createdAt);
    if (!t || t.y !== year) continue;
    monthly[t.m].total += o.totalCost ?? 0;
    monthly[t.m].count++;
  }
  const yearTotal = r2(monthly.reduce((s, m) => s + m.total, 0));

  /* تفصيل الشهر المختار */
  const monthRows = restaurantOut.filter((o) => {
    const t = ym(o.dispenseDate, o.createdAt);
    return t && t.y === year && t.m === month;
  });
  const monthTotal = r2(monthRows.reduce((s, o) => s + (o.totalCost ?? 0), 0));

  /* تجميع الشهر حسب الصنف ثم حسب القسم */
  const byItem = new Map<string, { name: string; unit: string; qty: number; total: number }>();
  const byDept = new Map<string, number>();
  for (const o of monthRows) {
    const cur = byItem.get(o.itemBarcode) ?? { name: o.itemName, unit: o.unit, qty: 0, total: 0 };
    cur.qty += (o.quantity ?? 0) - (o.returnedQty ?? 0);
    cur.total += o.totalCost ?? 0;
    byItem.set(o.itemBarcode, cur);
    byDept.set(o.departmentName, (byDept.get(o.departmentName) ?? 0) + (o.totalCost ?? 0));
  }
  const itemRows = [...byItem.entries()]
    .map(([barcode, v]) => ({ barcode, ...v }))
    .sort((a, b) => b.total - a.total);

  /* أصناف المطعم المعروضة للبيع — للربط مع منتجات البيع */
  const menuCount = items.filter((i) =>
    sections.some((s) => (i.salesSections ?? []).includes(s.id))
  ).length;

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <UtensilsCrossed size={20} className="text-orange-500" />
            المطعم
          </h2>
          <p className="text-sm text-slate-500">
            التكاليف على أساس المنصرف الشهري · {menuCount} صنف في قائمة المطعم
          </p>
        </div>
        {canDispense && (
          <Link href="/admin/costs/outgoing">
            <Button>
              <Plus size={16} /> تسجيل منصرف
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-800 leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          تكلفة المطعم = ما صُرف من الخامات على أقسامه. يُسجَّل الصرف <strong>في أي وقت</strong> من صفحة
          المنصرف، ويُجمَّع هنا شهرياً. وأصناف قائمة المطعم تُحدَّد من
          <Link href="/admin/food" className="underline mx-1">منتجات البيع ← مبيعات المطعم</Link>.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* شريط السنة */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-slate-800">تكاليف {year}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setYear(year - 1)} className="p-1.5 text-slate-400 hover:text-[#1C2D50]">
                  <ChevronRight size={16} />
                </button>
                <span className="text-sm font-bold text-[#1C2D50] tabular-nums-auto">{year}</span>
                <button onClick={() => setYear(year + 1)} className="p-1.5 text-slate-400 hover:text-[#1C2D50]">
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {monthly.map((m, i) => {
                const active = i === month;
                const max = Math.max(...monthly.map((x) => x.total), 1);
                return (
                  <button key={i} onClick={() => setMonth(i)}
                    className={`rounded-xl px-2 py-2 text-right transition-colors border-2 ${
                      active ? "border-orange-500 bg-orange-50" : "border-slate-100 hover:border-slate-200"
                    }`}>
                    <p className={`text-xs font-semibold ${active ? "text-orange-700" : "text-slate-600"}`}>
                      {MONTHS[i]}
                    </p>
                    <p className={`text-sm font-bold tabular-nums-auto ${active ? "text-orange-800" : "text-slate-700"}`}>
                      {m.total > 0 ? money(r2(m.total)) : "—"}
                    </p>
                    {/* عمود صغير يُظهر ثقل الشهر مقارنةً بأعلى شهر */}
                    <div className="h-1 rounded-full bg-slate-100 mt-1 overflow-hidden">
                      <div className="h-full bg-orange-400" style={{ width: `${(m.total / max) * 100}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
              <span className="text-sm text-slate-600">إجمالي تكاليف السنة</span>
              <span className="text-lg font-bold text-[#1C2D50] tabular-nums-auto">{money(yearTotal)} ريال</span>
            </div>
          </Card>

          {/* الشهر المختار */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingDown size={16} className="text-orange-500" />
              تفصيل {MONTHS[month]} {year}
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 text-slate-400 hover:text-[#1C2D50]"><ChevronRight size={16} /></button>
              <button onClick={nextMonth} className="p-1.5 text-slate-400 hover:text-[#1C2D50]"><ChevronLeft size={16} /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-orange-50 border-orange-100">
              <p className="text-xs text-orange-700 font-semibold">تكلفة الشهر</p>
              <p className="text-lg font-bold text-orange-800 tabular-nums-auto mt-1">{money(monthTotal)} ريال</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500 font-semibold">عمليات الصرف</p>
              <p className="text-lg font-bold text-slate-700 tabular-nums-auto mt-1">{monthRows.length.toLocaleString("en-US")}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500 font-semibold">أصناف مختلفة</p>
              <p className="text-lg font-bold text-slate-700 tabular-nums-auto mt-1">{itemRows.length.toLocaleString("en-US")}</p>
            </Card>
          </div>

          {/* حسب القسم */}
          {byDept.size > 0 && (
            <Card>
              <p className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Layers size={15} className="text-slate-500" /> حسب القسم
              </p>
              <div className="flex flex-wrap gap-2">
                {[...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                  <span key={name} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-medium tabular-nums-auto">
                    {name}: {money(r2(total))} ريال
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* حسب الصنف */}
          {itemRows.length === 0 ? (
            <Card className="flex flex-col items-center py-12 text-slate-400">
              <PackageMinus size={40} className="mb-3 opacity-40" />
              <p>لا يوجد منصرف على المطعم في {MONTHS[month]} {year}</p>
              <p className="text-xs mt-1">سجّله من صفحة المنصرف على أحد أقسام المطعم</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3 font-semibold">الصنف</th>
                    <th className="px-4 py-3 font-semibold">الكمية المصروفة</th>
                    <th className="px-4 py-3 font-semibold">التكلفة</th>
                    <th className="px-4 py-3 font-semibold">النسبة من الشهر</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((r) => (
                    <tr key={r.barcode} className="border-b border-slate-50 last:border-none">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800">{r.name}</span>
                        <span className="block text-[10px] text-slate-400 font-mono">{r.barcode}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums-auto">
                        {r2(r.qty).toLocaleString("en-US")} {r.unit}
                      </td>
                      <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">
                        {money(r2(r.total))} ريال
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-[60px]">
                            <div className="h-full bg-orange-400"
                              style={{ width: `${monthTotal > 0 ? (r.total / monthTotal) * 100 : 0}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-500 tabular-nums-auto w-10 shrink-0">
                            {monthTotal > 0 ? Math.round((r.total / monthTotal) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-3 text-[#1C2D50]">الإجمالي</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 tabular-nums-auto text-[#1C2D50]">{money(monthTotal)} ريال</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </Card>
          )}

          {/* آخر العمليات */}
          {monthRows.length > 0 && (
            <Card>
              <p className="font-bold text-slate-800 mb-2">عمليات الصرف في هذا الشهر</p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {[...monthRows]
                  .sort((a, b) => (b.dispenseDate ?? "").localeCompare(a.dispenseDate ?? ""))
                  .map((o) => (
                    <div key={o.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{o.itemName}</span>
                      <span className="text-xs text-slate-500 tabular-nums-auto shrink-0">
                        {o.quantity.toLocaleString("en-US")} {o.unit}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">{o.departmentName}</span>
                      <span className="text-xs font-semibold text-[#1C2D50] tabular-nums-auto shrink-0">
                        {money(o.totalCost ?? 0)}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums-auto shrink-0">{o.dispenseDate}</span>
                      <Actor uid={o.createdBy} showIcon={false} className="shrink-0" />
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
