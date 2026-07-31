"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcerts } from "@/lib/firestore/concerts";
import { getCostOutgoing, getCostDamages } from "@/lib/firestore/costs";
import { getAllExpenses, expenseNetAmount } from "@/lib/firestore/expenses";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Concert, CostOutgoing, ConcertExpense, CostDamage } from "@/types";
import { formatDate } from "@/lib/utils";
import { normalizeStatus, statusLabel, statusColor } from "@/lib/concert-status";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { TrendingUp, ChevronLeft, AlertTriangle, Info, XCircle } from "lucide-react";

const PAGE_SIZE = 10;

function calcHallCost(c: Concert): number {
  if (!c.hallCostType || !c.hallCostValue) return 0;
  if (c.hallCostType === "percentage") return ((c.price ?? 0) * c.hallCostValue) / 100;
  return c.hallCostValue;
}

interface Row {
  concert: Concert;
  vatRate: number;
  /** السعر شامل الضريبة كما هو مخزّن */
  gross: number;
  vat: number;
  /** صافي الإيراد قبل الضريبة — الأساس الصحيح للمقارنة بالتكاليف */
  net: number;
  collected: number;
  remaining: number;
  hall: number;
  rawMaterials: number;   // خامات الوارد (مخزّنة قبل الضريبة أصلاً)
  externalItems: number;  // مواد الموارد المستأجرة
  expenses: number;       // فواتير المصروفات، مُطبَّعة قبل الضريبة
  totalCosts: number;
  profit: number;
  margin: number;
  /** قيمة المواد المملوكة المستخدمة — تُعرض ولا تُحتسب */
  internalValue: number;
  refund: number;
}

export default function ProfitabilityPage() {
  const { appUser, can } = useAuth();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("profitability"));

  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [expenses, setExpenses] = useState<ConcertExpense[]>([]);
  const [damages, setDamages] = useState<CostDamage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Row | null>(null);

  useEffect(() => { setPage(1); }, [search, dateF]);


  useEffect(() => {
    async function load() {
      // ثلاث قراءات كاملة تُجمَّع في الذاكرة — بلا استعلامات متعددة ولا فهارس
      const [c, o, e, d] = await Promise.all([
        getConcerts(),
        getCostOutgoing().catch(() => [] as CostOutgoing[]),
        getAllExpenses().catch(() => [] as ConcertExpense[]),
        getCostDamages().catch(() => [] as CostDamage[]),
      ]);
      setConcerts(c);
      setOutgoing(o);
      setExpenses(e);
      setDamages(d);
      setLoading(false);
    }
    load();
  }, []);

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  /* ── تجميع التكاليف حسب الحفلة ── */
  const rawByConcert = new Map<string, number>();
  let orphanRaw = 0;
  for (const o of outgoing) {
    if (o.concertId) rawByConcert.set(o.concertId, (rawByConcert.get(o.concertId) ?? 0) + o.totalCost);
    else if (o.manualConcertName) orphanRaw += o.totalCost;
  }

  const expByConcert = new Map<string, ConcertExpense[]>();
  for (const e of expenses) {
    const arr = expByConcert.get(e.concertId) ?? [];
    arr.push(e);
    expByConcert.set(e.concertId, arr);
  }

  function buildRow(c: Concert): Row {
    const vatRate = c.vatRate ?? 15;
    const gross = c.price ?? 0;
    // نفس معادلة العقد حرفاً بحرف حتى تتطابق الصفحتان إلى الهللة
    const net = Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
    const vat = Math.round((gross - net) * 100) / 100;

    const collected = c.deposit ?? 0;
    const hall = calcHallCost(c);
    const rawMaterials = rawByConcert.get(c.id) ?? 0;
    const externalItems = c.externalItemsCost ?? 0;
    const expenseTotal = (expByConcert.get(c.id) ?? []).reduce(
      (s, e) => s + expenseNetAmount(e, vatRate),
      0
    );

    const totalCosts = hall + rawMaterials + externalItems + expenseTotal;
    const profit = net - totalCosts;
    return {
      concert: c,
      vatRate, gross, vat, net,
      collected,
      remaining: gross - collected,
      hall, rawMaterials, externalItems,
      expenses: expenseTotal,
      totalCosts,
      profit,
      margin: net > 0 ? Math.round((profit / net) * 100) : 0,
      internalValue: c.internalItemsValue ?? 0,
      refund: c.refundAmount ?? 0,
    };
  }

  const q = search.trim().toLowerCase();
  const numQ = search.trim().replace(/^#/, "");
  function passesSearch(c: Concert) {
    if (!q) return true;
    return (
      (c.clientName ?? "").toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.venueName ?? "").toLowerCase().includes(q) ||
      (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ))
    );
  }

  const inScope = concerts.filter((c) => matchesDate(c.date, dateF)).filter(passesSearch);
  const activeRows = inScope.filter((c) => normalizeStatus(c.status) !== "cancelled").map(buildRow);
  // الملغاة تكاليفها حقيقية — تُعرض منفصلة ولا تُدفن كما تفعل القائمة المالية
  const cancelledRows = inScope.filter((c) => normalizeStatus(c.status) === "cancelled").map(buildRow);

  const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tGross = sum(activeRows, (r) => r.gross);
  const tNet = sum(activeRows, (r) => r.net);
  const tVat = sum(activeRows, (r) => r.vat);
  const tCosts = sum(activeRows, (r) => r.totalCosts);
  const tProfit = tNet - tCosts;
  const tInternal = sum(activeRows, (r) => r.internalValue);
  const tCancelledLoss = sum(cancelledRows, (r) => r.totalCosts + r.refund);
  // التالف خسارة عامة لا تكلفة حفلة — أُخرج من totalCost عند تسجيله
  const tDamage = Math.round(damages.reduce((s, d) => s + d.totalCost, 0) * 100) / 100;

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = activeRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp size={22} className="text-emerald-600" />
          ربحية الحفلات
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {activeRows.length} حفلة — الربح محسوب على الإيراد <b>قبل الضريبة</b>
        </p>
      </div>

      {/* لماذا قبل الضريبة — يمنع سوء قراءة الأرقام */}
      <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          سعر الحفلة مخزّن شاملاً الضريبة، وتكاليف الخامات مخزّنة قبلها. لذلك يُستخرج
          صافي الإيراد قبل الضريبة أولاً ثم تُخصم منه التكاليف — وإلا ظهر ربح أعلى من
          الحقيقي بنحو ١٣٪ لأن الضريبة تُورَّد للدولة ولا تخصّك.
        </p>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم العميل أو الحفلة أو رقمها أو المكان..." />
      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={activeRows.length} unitLabel="حفلة" />

      {/* الإجماليات */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "السعر شامل الضريبة", value: tGross, cls: "text-slate-700" },
          { label: "الضريبة", value: tVat, cls: "text-slate-500" },
          { label: "صافي الإيراد قبل الضريبة", value: tNet, cls: "text-[#1C2D50]" },
          { label: "إجمالي التكاليف", value: tCosts, cls: "text-red-600" },
          { label: "الربح", value: tProfit, cls: tProfit >= 0 ? "text-emerald-700" : "text-red-700" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums-auto ${s.cls}`}>{money(s.value)}</p>
            <p className="text-xs text-slate-400">ريال</p>
          </Card>
        ))}
      </div>

      {/* بنود تُعرض ولا تُحتسب */}
      {(tInternal > 0 || orphanRaw > 0 || tCancelledLoss > 0 || tDamage > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tInternal > 0 && (
            <Card className="border-slate-200">
              <p className="text-xs text-slate-500 mb-1">قيمة المواد الداخلية المستخدمة</p>
              <p className="text-lg font-bold text-slate-600 tabular-nums-auto">{money(tInternal)} ريال</p>
              <p className="text-[11px] text-slate-400 mt-0.5">أصول مملوكة ترجع بعد الحفلة — غير محتسبة في التكلفة</p>
            </Card>
          )}
          {orphanRaw > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <p className="text-xs text-orange-700 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> خامات غير مرتبطة بحفلة
              </p>
              <p className="text-lg font-bold text-orange-700 tabular-nums-auto">{money(orphanRaw)} ريال</p>
              <p className="text-[11px] text-orange-600 mt-0.5">صُرفت باسم مكتوب يدوياً فلا تُحمَّل على أي حفلة</p>
            </Card>
          )}
          {tDamage > 0 && (
            <Card className="border-red-200 bg-red-50">
              <p className="text-xs text-red-700 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> خسارة التالف
              </p>
              <p className="text-lg font-bold text-red-700 tabular-nums-auto">{money(tDamage)} ريال</p>
              <p className="text-[11px] text-red-600 mt-0.5">{damages.length} قيد — خامات تلفت فلا تُحمَّل على حفلة</p>
            </Card>
          )}
          {tCancelledLoss > 0 && (
            <Card className="border-red-200 bg-red-50">
              <p className="text-xs text-red-700 mb-1 flex items-center gap-1">
                <XCircle size={12} /> خسارة الحفلات الملغاة
              </p>
              <p className="text-lg font-bold text-red-700 tabular-nums-auto">{money(tCancelledLoss)} ريال</p>
              <p className="text-[11px] text-red-600 mt-0.5">{cancelledRows.length} حفلة — تكاليف صُرفت + مبالغ مستردة</p>
            </Card>
          )}
        </div>
      )}

      {/* الجدول */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
              <th className="px-3 py-3 font-semibold">العميل</th>
              <th className="px-3 py-3 font-semibold">التاريخ</th>
              <th className="px-3 py-3 font-semibold">الصافي قبل الضريبة</th>
              <th className="px-3 py-3 font-semibold">المحصَّل</th>
              <th className="px-3 py-3 font-semibold">المتبقي</th>
              <th className="px-3 py-3 font-semibold">القاعة</th>
              <th className="px-3 py-3 font-semibold">خامات</th>
              <th className="px-3 py-3 font-semibold">موارد مستأجرة</th>
              <th className="px-3 py-3 font-semibold">مصروفات</th>
              <th className="px-3 py-3 font-semibold">إجمالي التكاليف</th>
              <th className="px-3 py-3 font-semibold">الربح</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={12} className="text-center text-slate-400 py-10">لا توجد حفلات مطابقة</td></tr>
            ) : paginated.map((r) => (
              <tr key={r.concert.id} className="border-b border-slate-50 last:border-none hover:bg-slate-50 cursor-pointer"
                onClick={() => setDetail(r)}>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-800">{r.concert.clientName || r.concert.name}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor(r.concert.status)}`}>
                    {statusLabel(r.concert.status)}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-500 tabular-nums-auto">{formatDate(r.concert.date)}</td>
                <td className="px-3 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{money(r.net)}</td>
                <td className="px-3 py-3 tabular-nums-auto text-emerald-600">{money(r.collected)}</td>
                <td className="px-3 py-3 tabular-nums-auto text-orange-600">{r.remaining > 0 ? money(r.remaining) : "—"}</td>
                <td className="px-3 py-3 tabular-nums-auto text-slate-600">{r.hall > 0 ? money(r.hall) : "—"}</td>
                <td className="px-3 py-3 tabular-nums-auto text-slate-600">{r.rawMaterials > 0 ? money(r.rawMaterials) : "—"}</td>
                <td className="px-3 py-3 tabular-nums-auto text-slate-600">{r.externalItems > 0 ? money(r.externalItems) : "—"}</td>
                <td className="px-3 py-3 tabular-nums-auto text-slate-600">{r.expenses > 0 ? money(r.expenses) : "—"}</td>
                <td className="px-3 py-3 tabular-nums-auto font-semibold text-red-600">{r.totalCosts > 0 ? money(r.totalCosts) : "—"}</td>
                <td className={`px-3 py-3 tabular-nums-auto font-bold ${r.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {money(r.profit)}
                  <span className="block text-[10px] font-normal text-slate-400">{r.margin}%</span>
                </td>
                <td className="px-3 py-3"><ChevronLeft size={14} className="text-slate-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

      {/* الحفلات الملغاة */}
      {cancelledRows.length > 0 && (
        <Card>
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            حفلات ملغاة ({cancelledRows.length})
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            تكاليفها صُرفت فعلاً ولا تظهر في القائمة المالية — الخسارة = التكاليف + المبلغ المسترد
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold">العميل</th>
                  <th className="px-3 py-2 font-semibold">التاريخ</th>
                  <th className="px-3 py-2 font-semibold">التكاليف</th>
                  <th className="px-3 py-2 font-semibold">المسترد</th>
                  <th className="px-3 py-2 font-semibold">الخسارة</th>
                </tr>
              </thead>
              <tbody>
                {cancelledRows.map((r) => (
                  <tr key={r.concert.id} className="border-b border-slate-50 last:border-none">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.concert.clientName || r.concert.name}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums-auto">{formatDate(r.concert.date)}</td>
                    <td className="px-3 py-2 tabular-nums-auto text-slate-600">{money(r.totalCosts)}</td>
                    <td className="px-3 py-2 tabular-nums-auto text-slate-600">{money(r.refund)}</td>
                    <td className="px-3 py-2 tabular-nums-auto font-bold text-red-700">{money(r.totalCosts + r.refund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* تفصيل حفلة */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? (detail.concert.clientName || detail.concert.name) : ""} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["السعر شامل الضريبة", detail.gross, "text-slate-700"],
                [`الضريبة (${detail.vatRate}%)`, detail.vat, "text-slate-500"],
                ["الصافي قبل الضريبة", detail.net, "text-[#1C2D50] font-bold"],
                ["المحصَّل من العميل", detail.collected, "text-emerald-600"],
              ].map(([l, v, cls]) => (
                <div key={l as string} className="flex justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <span className="text-slate-500">{l as string}</span>
                  <span className={`tabular-nums-auto ${cls as string}`}>{money(v as number)}</span>
                </div>
              ))}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">التكاليف</div>
              {[
                ["تكلفة القاعة", detail.hall],
                ["خامات الوارد", detail.rawMaterials],
                ["مواد الموارد المستأجرة", detail.externalItems],
                ["فواتير المصروفات", detail.expenses],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between px-3 py-2 border-t border-slate-100 text-sm">
                  <span className="text-slate-600">{l as string}</span>
                  <span className="tabular-nums-auto text-slate-700">{money(v as number)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 border-t border-slate-200 bg-red-50 text-sm font-bold">
                <span className="text-red-700">إجمالي التكاليف</span>
                <span className="tabular-nums-auto text-red-700">{money(detail.totalCosts)}</span>
              </div>
            </div>

            <div className={`flex justify-between px-4 py-3 rounded-xl font-bold ${detail.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              <span>الربح ({detail.margin}%)</span>
              <span className="tabular-nums-auto">{money(detail.profit)} ريال</span>
            </div>

            {detail.internalValue > 0 && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                استُخدمت مواد داخلية مملوكة بقيمة{" "}
                <b className="tabular-nums-auto">{money(detail.internalValue)} ريال</b> — ترجع بعد الحفلة فلا تُحتسب ضمن التكلفة.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
