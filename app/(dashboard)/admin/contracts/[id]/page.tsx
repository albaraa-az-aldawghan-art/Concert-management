"use client";

/* تفاصيل العقد وجدوله اليومي: دفتر تشغيل المقصف.
   ثلاثة أرقام تُدخَل لكل صنف — المورَّد والتالف والمتبقي — وما عداها
   يحسبه الخادم. الشاشة تُظهر الحساب قبل الحفظ كي يُرى الخطأ لا ليُكتشف. */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { getContractById } from "@/lib/firestore/contracts";
import { getCostItems } from "@/lib/firestore/costs";
import { getSectionsOfChannel, itemsOfSection } from "@/lib/firestore/sales";
import {
  getContractMonth, saveContractDay, deleteContractDay, setLedgerConfig,
  postMonthCollections, unpostMonthCollections, ContractMonth,
} from "@/lib/firestore/contract-ledger";
import type { Contract, CostItem, SalesSection, ContractExpenseKind } from "@/types";
import {
  FileSignature, ChevronRight, Plus, Trash2, Save, Settings2, Download,
  Info, CalendarDays, AlertTriangle, CheckCircle2, Undo2, Table2,
} from "lucide-react";

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const int = (n: number) => (n ?? 0).toLocaleString("en-US");
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthOf = (d: string) => d.slice(0, 7);

const METHODS: { key: string; label: string }[] = [
  { key: "bank_transfer", label: "تحويل بنكي" },
  { key: "mada", label: "مدى" },
  { key: "visa", label: "فيزا" },
  { key: "cash", label: "كاش" },
];

const DEFAULT_EXPENSES: { key: string; label: string; kind: ContractExpenseKind }[] = [
  { key: "workers", label: "العمال", kind: "from_till" },
  { key: "admin", label: "الإدارة", kind: "from_till" },
  { key: "guard", label: "الحارس", kind: "from_till" },
  { key: "teachers", label: "المدرسين", kind: "from_till" },
  { key: "error", label: "مقدار الخطأ", kind: "deduct_collected" },
];

const KIND_LABEL: Record<ContractExpenseKind, string> = {
  from_till: "يُدفع من الصندوق",
  deduct_collected: "خصم من المحصَّل",
};

interface LineDraft { barcode: string; supplied: string; damaged: string; remaining: string }

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { feat } = useAuth();

  const fx = {
    view:   feat("contracts", "ledger_view"),
    edit:   feat("contracts", "ledger_edit"),
    del:    feat("contracts", "ledger_delete"),
    config: feat("contracts", "ledger_config"),
    post:   feat("contracts", "ledger_post"),
    export: feat("contracts", "ledger_export"),
  };
  const ff = {
    cost:        feat("contracts", "lf_cost"),
    collections: feat("contracts", "lf_collections"),
  };

  const [contract, setContract] = useState<Contract | null>(null);
  const [items, setItems] = useState<CostItem[]>([]);
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [data, setData] = useState<ContractMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ── مسودّة اليوم ── */
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [collections, setCollections] = useState<Record<string, string>>({});
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [custody, setCustody] = useState("");
  const [notes, setNotes] = useState("");
  const [pickSection, setPickSection] = useState("");
  const [deleteDayTarget, setDeleteDayTarget] = useState<string | null>(null);

  /* ── الإعداد ── */
  const [showConfig, setShowConfig] = useState(false);
  const [cfgLines, setCfgLines] = useState<{ key: string; label: string; kind: ContractExpenseKind }[]>([]);
  const [cfgCustody, setCfgCustody] = useState("");
  const [cfgSections, setCfgSections] = useState<string[]>([]);
  const [cfgDept, setCfgDept] = useState("");

  const expenseConfig = contract?.ledger?.expenseLines?.length ? contract.ledger.expenseLines : DEFAULT_EXPENSES;

  useEffect(() => { loadBase(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => { if (contract) loadMonth(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month, contract?.id]);

  async function loadBase() {
    setLoading(true);
    try {
      const [c, its, secs] = await Promise.all([
        getContractById(id),
        getCostItems().catch(() => []),
        getSectionsOfChannel("contracts").catch(() => []),
      ]);
      setContract(c);
      setItems(its);
      setSections(secs);
      if (c) {
        setCfgLines(c.ledger?.expenseLines?.length ? c.ledger.expenseLines : DEFAULT_EXPENSES);
        setCfgCustody(String(c.ledger?.defaultCustody ?? 500));
        setCfgSections(c.ledger?.sectionIds ?? []);
        setCfgDept(c.ledger?.departmentName ?? "");
        setCustody(String(c.ledger?.defaultCustody ?? 500));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMonth() {
    if (!fx.view) return;
    try {
      setData(await getContractMonth(id, month));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذّر تحميل الشهر", "error");
    }
  }

  /* ملء المسودّة من يوم مسجَّل، أو تفريغها ليوم جديد */
  useEffect(() => {
    const day = data?.days.find((d) => d.date === date);
    if (day) {
      setLines(day.lines.map((l) => ({
        barcode: l.barcode, supplied: String(l.supplied), damaged: String(l.damaged), remaining: String(l.remaining),
      })));
      setCollections(Object.fromEntries(METHODS.map((m) => [m.key, String((day.collections as Record<string, number>)?.[m.key] ?? 0)])));
      setExpenses(Object.fromEntries((day.expenses ?? []).map((e) => [e.key, String(e.amount)])));
      setCustody(String(day.custody ?? 0));
      setNotes(day.notes ?? "");
    } else {
      setLines([]);
      setCollections({});
      setExpenses({});
      setNotes("");
      setCustody(String(contract?.ledger?.defaultCustody ?? 500));
    }
  }, [date, data, contract?.ledger?.defaultCustody]);

  const terms = contract?.terms ?? [];
  const termOf = useMemo(() => new Map(terms.map((t) => [t.barcode, t])), [terms]);

  /* رصيد أول اليوم كما سيحسبه الخادم — من آخر يوم مسجَّل قبل التاريخ */
  const openingMap = useMemo(() => {
    const prev = (data?.days ?? []).filter((d) => d.date < date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const m = new Map<string, number>();
    for (const t of terms) m.set(t.barcode, t.openingQty ?? 0);
    if (prev) for (const l of prev.lines) m.set(l.barcode, l.remaining);
    return m;
  }, [data, date, terms]);

  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const computed = useMemo(() => {
    const rows = lines.map((l) => {
      const t = termOf.get(l.barcode);
      const opening = openingMap.get(l.barcode) ?? 0;
      const available = r2(num(l.supplied) + opening);
      const sold = r2(available - num(l.remaining) - num(l.damaged));
      return {
        ...l,
        name: t?.itemName ?? l.barcode,
        unit: t?.unit ?? "",
        price: t?.unitPrice ?? 0,
        opening, available, sold,
        revenue: r2(sold * (t?.unitPrice ?? 0)),
        invalid: sold < 0,
      };
    });
    const sales = r2(rows.reduce((s, x) => s + Math.max(x.revenue, 0), 0));
    const collected = r2(METHODS.reduce((s, m) => s + num(collections[m.key] ?? ""), 0));
    const deducted = r2(expenseConfig.filter((e) => e.kind === "deduct_collected").reduce((s, e) => s + num(expenses[e.key] ?? ""), 0));
    const paidFromTill = r2(expenseConfig.filter((e) => e.kind === "from_till").reduce((s, e) => s + num(expenses[e.key] ?? ""), 0));
    const expected = r2(sales - paidFromTill);
    return { rows, sales, collected, deducted, paidFromTill, expected, variance: r2(collected - deducted - expected) };
  }, [lines, termOf, openingMap, collections, expenses, expenseConfig]);

  const sectionItems = pickSection ? itemsOfSection(items, pickSection) : [];
  const chosen = new Set(lines.map((l) => l.barcode));
  const isPosted = data?.days.find((d) => d.date === date)?.postedPaymentIds?.length ? true : false;
  const editable = fx.edit && contract?.status === "active" && !isPosted;

  function addLine(barcode: string) {
    if (chosen.has(barcode)) return;
    setLines((p) => [...p, { barcode, supplied: "", damaged: "0", remaining: "0" }]);
  }
  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }

  async function handleSaveDay() {
    if (lines.length === 0) { showToast("أضف صنفاً واحداً على الأقل", "error"); return; }
    const bad = computed.rows.find((r) => r.invalid);
    if (bad) { showToast(`"${bad.name}": التالف والمتبقي أكثر من المتاح`, "error"); return; }
    setSaving(true);
    try {
      await saveContractDay(id, {
        date,
        lines: lines.map((l) => ({
          barcode: l.barcode, supplied: num(l.supplied), damaged: num(l.damaged), remaining: num(l.remaining),
        })),
        collections: Object.fromEntries(METHODS.map((m) => [m.key, num(collections[m.key] ?? "")])),
        expenses: expenseConfig.map((e) => ({ key: e.key, amount: num(expenses[e.key] ?? "") })),
        custody: num(custody),
        notes: notes.trim() || null,
      });
      showToast("حُفظ اليوم");
      await loadMonth();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذّر الحفظ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    try { await fn(); showToast(msg); await loadBase(); await loadMonth(); }
    catch (e) { showToast(e instanceof Error ? e.message : "تعذّرت العملية", "error"); }
    finally { setSaving(false); }
  }

  async function handleExport() {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/contracts/${id}/export?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "تعذّر التصدير");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${contract?.name ?? "عقد"}-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "تعذّر التصدير", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!contract) {
    return <Card className="py-12 text-center text-slate-400">العقد غير موجود</Card>;
  }
  if (!fx.view) {
    return <Card className="py-12 text-center text-slate-400">لا تملك صلاحية عرض الجدول اليومي</Card>;
  }

  const vatRate = contract.vatRate ?? 15;
  const net = r2((contract.totalValue ?? 0) / (1 + vatRate / 100));

  return (
    <div className="space-y-5">
      {/* ── الرأس ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/contracts" className="text-xs text-slate-400 hover:text-[#1C2D50] inline-flex items-center gap-1">
            <ChevronRight size={13} /> التعاقدات
          </Link>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-0.5">
            <FileSignature size={20} className="text-[#1C2D50]" />
            {contract.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums-auto flex items-center gap-1.5">
            <CalendarDays size={11} /> {contract.startDate} ← {contract.endDate}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {fx.config && (
            <Button variant="secondary" onClick={() => setShowConfig(true)} className="gap-2">
              <Settings2 size={15} /> إعداد الجدول
            </Button>
          )}
          {fx.export && (
            <Button variant="secondary" onClick={handleExport} className="gap-2">
              <Download size={15} /> تصدير الشهر
            </Button>
          )}
        </div>
      </div>

      {/* ── ملخص الشهر ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[11rem]" />
        {data && <span className="text-xs text-slate-500">{data.days.length} يوم مسجَّل</span>}
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { l: "الإجمالي (المبيعات)", v: data.totals.sales, cls: "text-[#1C2D50]", show: true },
            { l: "الاستهلاك", v: data.totals.soldQty, cls: "text-slate-700", show: true, isInt: true },
            { l: "الجرد المتبقي", v: data.totals.closingStock, cls: "text-slate-700", show: true, isInt: true },
            { l: "تكلفة ما بيع", v: data.totals.cost, cls: "text-orange-700", show: ff.cost },
            { l: "المصروفات اليومية", v: data.totals.expenses, cls: "text-orange-700", show: ff.cost },
            { l: "ربح العقد", v: data.totals.profit, cls: data.totals.profit >= 0 ? "text-emerald-700" : "text-red-600", show: ff.cost },
          ].filter((x) => x.show).map((x) => (
            <Card key={x.l}>
              <p className="text-[11px] text-slate-500">{x.l}</p>
              <p className={`text-lg font-bold tabular-nums-auto mt-0.5 ${x.cls}`}>
                {x.isInt ? int(x.v) : money(x.v)}
              </p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "قيمة العقد", v: money(contract.totalValue ?? 0), cls: "text-slate-800" },
          { l: "الصافي قبل الضريبة", v: money(net), cls: "text-slate-800" },
          { l: "المحصَّل على العقد", v: money(contract.paid ?? 0), cls: "text-emerald-700" },
          { l: "المتبقي", v: money(r2((contract.totalValue ?? 0) - (contract.paid ?? 0))), cls: "text-orange-700" },
        ].map((x) => (
          <Card key={x.l}>
            <p className="text-[11px] text-slate-500">{x.l}</p>
            <p className={`font-bold tabular-nums-auto mt-0.5 ${x.cls}`}>{x.v} ريال</p>
          </Card>
        ))}
      </div>

      {terms.length === 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <p>لا بنود في هذا العقد — الجدول اليومي يعمل على بنوده. أضفها من صفحة التعاقدات أولاً.</p>
        </div>
      )}

      {/* ══ إدخال اليوم ══ */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Table2 size={17} className="text-[#1C2D50]" /> يوم التشغيل
          </h3>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMonth(monthOf(e.target.value)); }} className="max-w-[10.5rem]" />
            {fx.del && data?.days.some((d) => d.date === date) && (
              <button onClick={() => setDeleteDayTarget(date)} className="p-2 text-slate-400 hover:text-red-500" title="حذف اليوم">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {isPosted && (
          <div className="flex items-start gap-2.5 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>رُحِّل تحصيل هذا اليوم دفعةً على العقد — تراجَع عن الترحيل قبل التعديل.</p>
          </div>
        )}

        {/* الترتيب: القسم ← الصنف ← الكمية */}
        {editable && terms.length > 0 && (
          <div className="bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl p-3 space-y-2.5">
            <p className="text-[11px] font-semibold text-[#1C2D50]">اختر القسم ثم الصنف</p>
            <Select value={pickSection} onChange={(e) => setPickSection(e.target.value)}>
              <option value="">— القسم —</option>
              {sections
                .filter((s) => !contract.ledger?.sectionIds?.length || contract.ledger.sectionIds.includes(s.id))
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {pickSection && (
              <div className="flex flex-wrap gap-1.5">
                {sectionItems.filter((it) => termOf.has(it.id)).map((it) => (
                  <button
                    key={it.id}
                    onClick={() => addLine(it.id)}
                    disabled={chosen.has(it.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      chosen.has(it.id)
                        ? "bg-slate-200 text-slate-400 border-slate-200 cursor-default"
                        : "bg-white text-[#1C2D50] border-[#D4DCE8] hover:bg-[#1C2D50] hover:text-white"
                    }`}
                  >
                    <Plus size={10} className="inline" /> {it.name}
                  </button>
                ))}
                {sectionItems.filter((it) => termOf.has(it.id)).length === 0 && (
                  <p className="text-[11px] text-slate-400">لا صنف في هذا القسم من بنود العقد</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* سطور اليوم */}
        {lines.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">لا أصناف لهذا اليوم بعد</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[46rem]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="text-right font-medium py-2 px-2">الصنف</th>
                  <th className="font-medium px-2">سعر البيع</th>
                  <th className="font-medium px-2">رصيد أول اليوم</th>
                  <th className="font-medium px-2">المورَّد</th>
                  <th className="font-medium px-2">التالف</th>
                  <th className="font-medium px-2">المتبقي</th>
                  <th className="font-medium px-2">المباع</th>
                  <th className="font-medium px-2">مبلغ البيع</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {computed.rows.map((row, i) => (
                  <tr key={row.barcode} className={`border-b border-slate-50 ${row.invalid ? "bg-red-50" : ""}`}>
                    <td className="py-1.5 px-2 font-medium text-slate-700">{row.name}</td>
                    <td className="px-2 text-center tabular-nums-auto text-slate-500">{money(row.price)}</td>
                    <td className="px-2 text-center tabular-nums-auto text-slate-500">{int(row.opening)}</td>
                    {(["supplied", "damaged", "remaining"] as const).map((f) => (
                      <td key={f} className="px-1">
                        <input
                          type="number" min="0" inputMode="numeric"
                          value={row[f]}
                          disabled={!editable}
                          onChange={(e) => setLine(i, { [f]: e.target.value })}
                          className="w-20 text-center tabular-nums-auto rounded-lg border border-slate-200 py-1 disabled:bg-slate-50 disabled:text-slate-400 focus:border-[#1C2D50] outline-none"
                        />
                      </td>
                    ))}
                    <td className={`px-2 text-center tabular-nums-auto font-bold ${row.invalid ? "text-red-600" : "text-slate-800"}`}>
                      {int(row.sold)}
                    </td>
                    <td className="px-2 text-center tabular-nums-auto font-bold text-[#1C2D50]">{money(row.revenue)}</td>
                    <td className="px-1">
                      {editable && (
                        <button onClick={() => setLines((p) => p.filter((_, k) => k !== i))}
                          className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold text-slate-800">
                  <td className="py-2 px-2">الإجمالي</td>
                  <td colSpan={6} />
                  <td className="px-2 text-center tabular-nums-auto text-[#1C2D50]">{money(computed.sales)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {computed.rows.some((r) => r.invalid) && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>التالف والمتبقي أكثر من المتاح في صنف أو أكثر — المباع لا يكون سالباً.</p>
          </div>
        )}

        {/* ── التحصيل والمطابقة ── */}
        {ff.collections && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">التحصيل</p>
              {METHODS.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24">{m.label}</span>
                  <input type="number" min="0" inputMode="decimal" disabled={!editable}
                    value={collections[m.key] ?? ""}
                    onChange={(e) => setCollections((p) => ({ ...p, [m.key]: e.target.value }))}
                    className="flex-1 text-left tabular-nums-auto rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 focus:border-[#1C2D50] outline-none" />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-500 w-24">العهدة</span>
                <input type="number" min="0" disabled={!editable} value={custody}
                  onChange={(e) => setCustody(e.target.value)}
                  className="flex-1 text-left tabular-nums-auto rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 focus:border-[#1C2D50] outline-none" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">المصروفات</p>
              {expenseConfig.map((e) => (
                <div key={e.key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24 truncate" title={KIND_LABEL[e.kind]}>{e.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    e.kind === "from_till" ? "bg-orange-50 text-orange-700" : "bg-purple-50 text-purple-700"
                  }`}>{e.kind === "from_till" ? "من الصندوق" : "خصم"}</span>
                  <input type="number" min="0" inputMode="decimal" disabled={!editable}
                    value={expenses[e.key] ?? ""}
                    onChange={(v) => setExpenses((p) => ({ ...p, [e.key]: v.target.value }))}
                    className="flex-1 text-left tabular-nums-auto rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 focus:border-[#1C2D50] outline-none" />
                </div>
              ))}
            </div>
          </div>
        )}

        {ff.collections && (
          <div className={`rounded-xl px-4 py-3 text-xs border ${
            computed.variance === 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 tabular-nums-auto">
              <div><p className="opacity-70 text-[10px]">المحصَّل</p><p className="font-bold">{money(computed.collected)}</p></div>
              <div><p className="opacity-70 text-[10px]">− خصم من المحصَّل</p><p className="font-bold">{money(computed.deducted)}</p></div>
              <div><p className="opacity-70 text-[10px]">المبيعات</p><p className="font-bold">{money(computed.sales)}</p></div>
              <div><p className="opacity-70 text-[10px]">− من الصندوق</p><p className="font-bold">{money(computed.paidFromTill)}</p></div>
              <div><p className="opacity-70 text-[10px]">الفرق</p><p className="font-bold text-sm">{money(computed.variance)}</p></div>
            </div>
            <p className="mt-2 opacity-80">
              {computed.variance === 0
                ? "الصندوق مطابق ✓"
                : computed.variance > 0
                  ? `زيادة ${money(computed.variance)} في الصندوق عمّا تفسّره المبيعات`
                  : `نقص ${money(Math.abs(computed.variance))} عمّا تفسّره المبيعات`}
            </p>
          </div>
        )}

        {editable && (
          <div className="flex justify-end gap-2">
            <Button onClick={handleSaveDay} loading={saving} className="gap-2">
              <Save size={15} /> حفظ اليوم
            </Button>
          </div>
        )}
      </Card>

      {/* ══ شبكة الشهر — تخطيط ورقة الإكسل ══ */}
      {data && data.days.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-bold text-slate-800">شبكة الشهر</h3>
            {fx.post && ff.collections && (
              data.posted ? (
                <Button variant="secondary" onClick={() => run(() => unpostMonthCollections(id, month), "أُلغي الترحيل")} className="gap-2">
                  <Undo2 size={15} /> التراجع عن ترحيل التحصيل
                </Button>
              ) : (
                <Button onClick={() => run(() => postMonthCollections(id, month), "رُحِّل التحصيل دفعةً")} className="gap-2">
                  <CheckCircle2 size={15} /> ترحيل تحصيل الشهر ({money(data.totals.collected)})
                </Button>
              )
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky right-0 bg-[#1C2D50] text-white px-2 py-1.5 text-right z-10 min-w-[9rem]">الاسم</th>
                  <th className="bg-[#1C2D50] text-white px-2 py-1.5">سعر البيع</th>
                  {data.days.map((d) => (
                    <th key={d.date} colSpan={5} className="bg-[#EEF1F7] text-[#1C2D50] px-2 py-1.5 border-s border-white tabular-nums-auto">
                      {d.date.slice(5)}
                    </th>
                  ))}
                  <th colSpan={ff.cost ? 4 : 3} className="bg-[#1C2D50] text-white px-2 py-1.5">إجمالي الشهر</th>
                </tr>
                <tr>
                  <th className="sticky right-0 bg-slate-100 z-10" />
                  <th className="bg-slate-100" />
                  {data.days.map((d) => (
                    ["مورَّد", "تالف", "متبقٍ", "مباع", "مبلغ"].map((h, i) => (
                      <th key={d.date + h} className={`bg-slate-100 text-slate-600 font-medium px-1.5 py-1 whitespace-nowrap ${i === 0 ? "border-s border-slate-300" : ""}`}>{h}</th>
                    ))
                  ))}
                  {["الاجمالي", "الجرد المتبقي", "الاستهلاك", ...(ff.cost ? ["التكلفة"] : [])].map((h) => (
                    <th key={h} className="bg-slate-200 text-slate-700 font-medium px-1.5 py-1 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.barcode} className="hover:bg-slate-50">
                    <td className="sticky right-0 bg-white hover:bg-slate-50 px-2 py-1 font-medium text-slate-700 z-10 border-b border-slate-100">{it.itemName}</td>
                    <td className="px-2 py-1 text-center tabular-nums-auto text-slate-500 border-b border-slate-100">{money(it.salePrice)}</td>
                    {data.days.map((d) => {
                      const l = d.lines.find((x) => x.barcode === it.barcode);
                      return [
                        ["supplied", l?.supplied], ["damaged", l?.damaged], ["remaining", l?.remaining],
                        ["sold", l?.sold], ["revenue", l?.revenue],
                      ].map(([k, v], i) => (
                        <td key={d.date + k} className={`px-1.5 py-1 text-center tabular-nums-auto border-b border-slate-100 ${
                          i === 0 ? "border-s border-slate-200" : ""
                        } ${k === "revenue" ? "font-semibold text-[#1C2D50]" : "text-slate-600"}`}>
                          {v == null ? "" : k === "revenue" ? money(v as number) : int(v as number)}
                        </td>
                      ));
                    })}
                    <td className="px-1.5 py-1 text-center tabular-nums-auto font-bold text-[#1C2D50] bg-slate-50 border-b border-slate-100">{money(it.revenue)}</td>
                    <td className="px-1.5 py-1 text-center tabular-nums-auto bg-slate-50 border-b border-slate-100">{int(it.closing)}</td>
                    <td className="px-1.5 py-1 text-center tabular-nums-auto bg-slate-50 border-b border-slate-100">{int(it.soldQty)}</td>
                    {ff.cost && <td className="px-1.5 py-1 text-center tabular-nums-auto bg-slate-50 border-b border-slate-100 text-orange-700">{money(it.cost)}</td>}
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="sticky right-0 bg-white px-2 py-1.5 z-10">الإجمالي</td>
                  <td />
                  {data.days.map((d) => (
                    <td key={d.date} colSpan={5} className="px-1.5 py-1.5 text-center tabular-nums-auto text-[#1C2D50] border-s border-slate-200">
                      {money(d.totals?.sales ?? 0)}
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5 text-center tabular-nums-auto text-[#1C2D50] bg-slate-100">{money(data.totals.sales)}</td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums-auto bg-slate-100">{int(data.totals.closingStock)}</td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums-auto bg-slate-100">{int(data.totals.soldQty)}</td>
                  {ff.cost && <td className="px-1.5 py-1.5 text-center tabular-nums-auto bg-slate-100 text-orange-700">{money(data.totals.cost)}</td>}
                </tr>
                {ff.collections && (
                  <tr className="text-slate-600">
                    <td className="sticky right-0 bg-white px-2 py-1.5 z-10">الفرق</td>
                    <td />
                    {data.days.map((d) => (
                      <td key={d.date} colSpan={5} className={`px-1.5 py-1.5 text-center tabular-nums-auto border-s border-slate-200 font-semibold ${
                        (d.totals?.variance ?? 0) === 0 ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {money(d.totals?.variance ?? 0)}
                      </td>
                    ))}
                    <td colSpan={ff.cost ? 4 : 3} className={`px-1.5 py-1.5 text-center tabular-nums-auto font-bold bg-slate-100 ${
                      data.totals.variance === 0 ? "text-emerald-600" : "text-red-600"
                    }`}>{money(data.totals.variance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── إعداد الجدول ── */}
      <Modal open={showConfig} onClose={() => setShowConfig(false)} title="إعداد الجدول اليومي">
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 text-[11px] text-[#1C2D50] leading-relaxed">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>
              وسم بند المصروف يقرّر موضعه في المطابقة: <strong>«يُدفع من الصندوق»</strong> يخرج نقداً فيُنقص
              المتوقَّع، و<strong>«خصم من المحصَّل»</strong> دخل الصندوق من غير بيع فيُنقص المحصَّل.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">بنود المصروف</p>
            {cfgLines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={l.label} placeholder="اسم البند"
                  onChange={(e) => setCfgLines((p) => p.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <Select value={l.kind}
                  onChange={(e) => setCfgLines((p) => p.map((x, k) => (k === i ? { ...x, kind: e.target.value as ContractExpenseKind } : x)))}
                  className="max-w-[11rem]">
                  <option value="from_till">يُدفع من الصندوق</option>
                  <option value="deduct_collected">خصم من المحصَّل</option>
                </Select>
                <button onClick={() => setCfgLines((p) => p.filter((_, k) => k !== i))}
                  className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setCfgLines((p) => [...p, { key: `x${Date.now()}`, label: "", kind: "from_till" }])} className="gap-1.5 text-xs">
              <Plus size={13} /> بند جديد
            </Button>
          </div>

          <Input label="العهدة المبدئية" type="number" min="0" value={cfgCustody} onChange={(e) => setCfgCustody(e.target.value)} />
          <Input label="قسم المنصرف" value={cfgDept} onChange={(e) => setCfgDept(e.target.value)} placeholder="مثال: مقصف" />

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600">أقسام البيع المتاحة (فارغة = كلها)</p>
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <button key={s.id}
                  onClick={() => setCfgSections((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    cfgSections.includes(s.id)
                      ? "bg-[#1C2D50] text-white border-[#1C2D50]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-[#1C2D50]"
                  }`}>{s.name}</button>
              ))}
              {sections.length === 0 && <p className="text-[11px] text-slate-400">لا أقسام في قناة التعاقدات بعد</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowConfig(false)}>إلغاء</Button>
            <Button loading={saving} onClick={() => run(async () => {
              await setLedgerConfig(id, {
                enabled: true,
                expenseLines: cfgLines.filter((l) => l.label.trim()),
                defaultCustody: Number(cfgCustody) || 0,
                sectionIds: cfgSections,
                departmentName: cfgDept.trim() || null,
              });
              setShowConfig(false);
            }, "حُفظ الإعداد")}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteDayTarget}
        onClose={() => setDeleteDayTarget(null)}
        onConfirm={() => run(async () => {
          await deleteContractDay(id, deleteDayTarget!);
          setDeleteDayTarget(null);
        }, "حُذف اليوم")}
        title={`حذف يوم ${deleteDayTarget ?? ""}`}
        message="كل ما صُرف في هذا اليوم يعود للمخزون، ويُمحى سجله. لا يمكن التراجع."
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
