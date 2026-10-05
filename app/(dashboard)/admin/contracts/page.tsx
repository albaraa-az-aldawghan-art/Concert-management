"use client";

/* التعاقدات: عقود الجهات بمددها وبنودها، وتكلفة ما صُرف عليها وربحيتها. */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox } from "@/components/ui/list-filters";
import { Actor } from "@/components/ui/actor";
import {
  getContracts, addContract, updateContract, cancelContract,
  completeContract, reopenContract, deleteContract, ContractDraft, getContractOperatingSummaries,
} from "@/lib/firestore/contracts";
import type { ContractOperatingSummary } from "@/lib/contract-operating-summary";
import { getCostItems, getCostOutgoing } from "@/lib/firestore/costs";
import { getSectionsOfChannel } from "@/lib/firestore/sales";
import { averageCost } from "@/lib/recipes";
import { Contract, ContractType, CostItem, CostOutgoing, SalesSection } from "@/types";
import { productContractPrice, contractPriceLabel, contractPricingDescription } from "@/lib/contract-pricing";
import {
  FileSignature, Plus, Trash2, Pencil, X, Check, Info, CalendarDays,
  Search, Ban, CheckCircle2, Table2, RotateCcw, TrendingUp, WalletCards,
  ReceiptText, Boxes, CircleDollarSign,
} from "lucide-react";
import Link from "next/link";

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "ساري", cls: "bg-emerald-50 text-emerald-700" },
  completed: { label: "منتهٍ", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "ملغى", cls: "bg-red-50 text-red-600" },
};

interface TermDraft { barcode: string; quantity: string; unitPrice: string }

export default function ContractsPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("contracts"));
  const canCreate = isAdmin || feat("contracts", "create");
  const canEdit = isAdmin || feat("contracts", "edit");
  const canTerms = isAdmin || feat("contracts", "terms");
  const canCancel = isAdmin || feat("contracts", "cancel");
  const canComplete = isAdmin || feat("contracts", "complete");
  const canDelete = isAdmin || feat("contracts", "delete");
  const canLedger = isAdmin || feat("contracts", "ledger_view");
  /* الحقول: دور قد يتابع العقود ولا يرى أرقامها */
  const fc = {
    value:  isAdmin || feat("contracts", "cf_value"),
    client: isAdmin || feat("contracts", "cf_client"),
    actor:  isAdmin || feat("contracts", "cf_actor"),
  };

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [operating, setOperating] = useState<Record<string, ContractOperatingSummary>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Contract | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Contract | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [reopenTarget, setReopenTarget] = useState<Contract | null>(null);

  const [form, setForm] = useState({
    name: "", clientName: "", clientPhone: "",
    startDate: "", endDate: "", totalValue: "", vatRate: "15", notes: "",
  });
  const [terms, setTerms] = useState<TermDraft[]>([]);
  const [termSearch, setTermSearch] = useState("");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [priceSectionId, setPriceSectionId] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [c, i, s, o, summaries] = await Promise.all([
      getContracts().catch(() => [] as Contract[]),
      getCostItems().catch(() => [] as CostItem[]),
      getSectionsOfChannel("contracts").catch(() => [] as SalesSection[]),
      getCostOutgoing().catch(() => [] as CostOutgoing[]),
      fc.value ? getContractOperatingSummaries().catch(() => ({})) : Promise.resolve({}),
    ]);
    setContracts(c);
    setItems(i);
    setSections(s);
    setOutgoing(o);
    setOperating(summaries);
    setLoading(false);
  }

  /** أصناف قناة التعاقدات وحدها — البنود منها لا من كل التكاليف */
  const contractItems = items.filter((i) =>
    sections.some((s) => (i.salesSections ?? []).includes(s.id)) &&
    (contractType !== "paid" || (i.salesSections ?? []).includes(priceSectionId))
  );

  function sourcePrice(barcode: string): { price?: number; error?: string } {
    const saved = editTarget?.terms.find((t) => t.barcode === barcode);
    if (saved) return { price: saved.unitPrice };
    if (!contractType) return { error: "اختر نوع العقد أولاً" };
    const item = items.find((i) => i.id === barcode);
    if (!item) return { error: "الصنف غير موجود" };
    try { return { price: productContractPrice(item, contractType, priceSectionId) }; }
    catch (error) { return { error: (error as Error).message }; }
  }

  /** ما صُرف فعلاً على كل عقد — التكلفة الحقيقية لا المقدّرة */
  const costByContract = new Map<string, number>();
  for (const o of outgoing) {
    if (!o.contractId) continue;
    costByContract.set(o.contractId, (costByContract.get(o.contractId) ?? 0) + (o.totalCost ?? 0));
  }

  function openAdd() {
    setEditTarget(null);
    setContractType("");
    setPriceSectionId("");
    const today = new Date().toISOString().slice(0, 10);
    setForm({ name: "", clientName: "", clientPhone: "", startDate: today, endDate: "", totalValue: "", vatRate: "15", notes: "" });
    setTerms([]);
    setTermSearch("");
    setShowForm(true);
  }

  function openEdit(c: Contract) {
    setEditTarget(c);
    setContractType(c.contractType ?? "");
    setPriceSectionId(c.priceSectionId ?? "");
    setForm({
      name: c.name, clientName: c.clientName ?? "", clientPhone: c.clientPhone ?? "",
      startDate: c.startDate, endDate: c.endDate,
      totalValue: (c.totalValue ?? 0) === 0 ? "" : String(c.totalValue), vatRate: (c.vatRate ?? 15) === 0 ? "" : String(c.vatRate ?? 15), notes: c.notes ?? "",
    });
    setTerms(c.terms.map((t) => ({ barcode: t.barcode, quantity: t.quantity === 0 ? "" : String(t.quantity), unitPrice: t.unitPrice === 0 ? "" : String(t.unitPrice) })));
    setTermSearch("");
    setShowForm(true);
  }

  function toggleTerm(barcode: string) {
    setTerms((prev) =>
      prev.some((t) => t.barcode === barcode)
        ? prev.filter((t) => t.barcode !== barcode)
        : [...prev, { barcode, quantity: "1", unitPrice: contractType ? String(sourcePrice(barcode).price ?? "") : "" }]
    );
  }

  const draftTotal = r2(
    terms.reduce((s, t) => s + r2((parseFloat(t.quantity) || 0) * (parseFloat(t.unitPrice) || 0)), 0)
  );
  const draftCost = r2(
    terms.reduce((s, t) => {
      const item = items.find((i) => i.id === t.barcode);
      return s + (parseFloat(t.quantity) || 0) * averageCost(item);
    }, 0)
  );

  async function handleSave() {
    if (!editTarget && !contractType) { showToast("اختر نوع العقد", "error"); return; }
    if (contractType === "paid" && !priceSectionId) { showToast("اختر قسم سعر البيع", "error"); return; }
    if (terms.some((t) => !Number.isFinite(Number(t.quantity)) || Number(t.quantity) <= 0)) {
      showToast("أدخل كمية أكبر من صفر لكل بند", "error"); return;
    }
    if (contractType) {
      const invalid = terms.find((t) => sourcePrice(t.barcode).error);
      if (invalid) { showToast(sourcePrice(invalid.barcode).error!, "error"); return; }
    }
    const draft: ContractDraft = {
      ...(contractType ? { contractType, priceSectionId: contractType === "paid" ? priceSectionId : null } : {}),
      name: form.name.trim(),
      clientName: form.clientName.trim() || null,
      clientPhone: form.clientPhone.trim() || null,
      startDate: form.startDate,
      endDate: form.endDate,
      vatRate: form.vatRate === "" ? 15 : Number(form.vatRate),
      totalValue: form.totalValue ? parseFloat(form.totalValue) : null,
      terms: terms
        .map((t) => ({
          barcode: t.barcode,
          quantity: parseFloat(t.quantity) || 0,
          unitPrice: parseFloat(t.unitPrice) || 0,
        }))
        .filter((t) => t.quantity > 0),
      notes: form.notes.trim() || null,
    };
    if (!draft.name) { showToast("اكتب اسم الجهة", "error"); return; }
    if (!draft.startDate || !draft.endDate) { showToast("حدّد مدة العقد", "error"); return; }
    setSaving(true);
    try {
      if (editTarget) await updateContract(editTarget.id, draft);
      else await addContract(draft);
      showToast(editTarget ? "حُفظت التعديلات" : "أُنشئ العقد");
      setShowForm(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function run(fn: () => Promise<void>, msg: string) {
    setSaving(true);
    try {
      await fn();
      showToast(msg);
      setCancelTarget(null);
      setDeleteTarget(null);
      setReopenTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = search.trim();
  const shown = contracts.filter(
    (c) => (!q || c.name.includes(q) || (c.clientName ?? "").includes(q) ||
      String(c.contractNumber ?? "").includes(q)) &&
      (!statusFilter || c.status === statusFilter) &&
      (!typeFilter || (c.contractType ?? "legacy") === typeFilter)
  );

  const tq = termSearch.trim();
  const termChoices = contractItems.filter((i) => !tq || i.name.includes(tq) || i.id.includes(tq));

  /* المجاميع المالية تستبعد الملغى، وتلتزم بنتائج البحث والفلاتر الحالية. */
  const financialContracts = shown.filter((contract) => contract.status !== "cancelled");
  const activeCount = contracts.filter((contract) => contract.status === "active").length;
  const aggregate = (list: Contract[]) => {
    const value = r2(list.reduce((sum, contract) => sum + (contract.totalValue ?? 0), 0));
    const sales = r2(list.reduce((sum, contract) => sum + (operating[contract.id]?.sales ?? 0), 0));
    const collected = r2(list.reduce((sum, contract) => sum + (operating[contract.id]?.collected ?? 0), 0));
    const posted = r2(list.reduce((sum, contract) => sum + (contract.paid ?? 0), 0));
    const rawCost = r2(list.reduce((sum, contract) => sum + (costByContract.get(contract.id) ?? 0), 0));
    const expenses = r2(list.reduce((sum, contract) => sum + (operating[contract.id]?.expenses ?? 0), 0));
    return { count: list.length, value, sales, collected, posted, rawCost, expenses, net: r2(sales - rawCost - expenses) };
  };
  const totals = aggregate(financialContracts);
  const typeTotals = (["collected", "paid", "legacy"] as const).map((type) => ({
    type,
    ...aggregate(financialContracts.filter((contract) => (contract.contractType ?? "legacy") === type)),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSignature size={20} className="text-[#1C2D50]" />
            التعاقدات
          </h2>
          <p className="text-sm text-slate-500">{contracts.length} عقد · {activeCount} ساري</p>
        </div>
        {canCreate && (
          <Button onClick={openAdd}>
            <Plus size={16} /> عقد جديد
          </Button>
        )}
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم الجهة أو العميل أو رقم العقد..." />
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="حالة العقد">
          <option value="">كل حالات العقود</option>
          <option value="active">ساري</option>
          <option value="completed">منتهٍ</option>
          <option value="cancelled">ملغى</option>
        </Select>
        <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="نوع العقد">
          <option value="">كل أنواع العقود</option>
          <option value="collected">محصّل — بسعر التكلفة</option>
          <option value="paid">مدفوع — بسعر البيع</option>
          <option value="legacy">عقد سابق</option>
        </Select>
      </div>

      {/* الأرقام أدناه من العقود الظاهرة بعد الفلاتر، مع استبعاد الملغى مالياً. */}
      {fc.value && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          {[
            { l: "العقود المحتسبة", v: totals.count.toLocaleString("en-US"), hint: `${shown.length - totals.count} ملغى مستبعد`, cls: "text-[#1C2D50]", icon: <FileSignature size={17} /> },
            { l: "قيمة الاتفاقات", v: `${money(totals.value)} ريال`, hint: "القيمة المكتوبة في العقود", cls: "text-[#1C2D50]", icon: <ReceiptText size={17} /> },
            { l: "مبيعات التشغيل", v: `${money(totals.sales)} ريال`, hint: "من الأيام المسجّلة فعليًا", cls: "text-blue-700", icon: <TrendingUp size={17} /> },
            { l: "تحصيل التشغيل", v: `${money(totals.collected)} ريال`, hint: `${money(totals.posted)} ريال مرحّل للدفعات`, cls: "text-emerald-700", icon: <WalletCards size={17} /> },
            { l: "التكاليف والمصروفات", v: `${money(totals.rawCost + totals.expenses)} ريال`, hint: `${money(totals.rawCost)} خامات · ${money(totals.expenses)} مصروفات`, cls: "text-orange-700", icon: <Boxes size={17} /> },
            { l: "صافي التشغيل", v: `${money(totals.net)} ريال`, hint: "المبيعات − الخامات − المصروفات", cls: totals.net >= 0 ? "text-emerald-700" : "text-red-600", icon: <CircleDollarSign size={17} /> },
          ].map((summary) => (
            <Card key={summary.l} className="min-w-0 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-500">{summary.l}</p>
                <span className="rounded-lg bg-slate-100 p-1.5 text-[#1C2D50]">{summary.icon}</span>
              </div>
              <p className={`mt-2 truncate text-base font-extrabold tabular-nums-auto sm:text-lg ${summary.cls}`}>{summary.v}</p>
              <p className="mt-1 truncate text-[10px] text-slate-400" title={summary.hint}>{summary.hint}</p>
            </Card>
          ))}
        </div>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-sm font-bold text-slate-800">ملخص حسب نوع العقد</h3><p className="mt-0.5 text-[11px] text-slate-400">للعقود غير الملغاة المطابقة للفلاتر</p></div>
            <span className="text-[11px] text-slate-400">المجموع: {totals.count} عقد</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {typeTotals.map((summary) => {
              const label = summary.type === "collected" ? "عقود محصّل" : summary.type === "paid" ? "عقود مدفوع" : "عقود سابقة";
              const detail = summary.type === "collected" ? "التسعير بسعر التكلفة" : summary.type === "paid" ? "التسعير بسعر البيع" : "أسعار محفوظة قبل التصنيف";
              return <div key={summary.type} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between"><b className="text-sm text-slate-800">{label}</b><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#1C2D50]">{summary.count} عقد</span></div>
                <p className="mt-0.5 text-[10px] text-slate-400">{detail}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-slate-400">قيمة الاتفاق</span><b className="block tabular-nums-auto text-slate-700">{money(summary.value)}</b></div>
                  <div><span className="text-slate-400">مبيعات التشغيل</span><b className="block tabular-nums-auto text-blue-700">{money(summary.sales)}</b></div>
                  <div><span className="text-slate-400">التحصيل</span><b className="block tabular-nums-auto text-emerald-700">{money(summary.collected)}</b></div>
                  <div><span className="text-slate-400">صافي التشغيل</span><b className={`block tabular-nums-auto ${summary.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(summary.net)}</b></div>
                </div>
              </div>;
            })}
          </div>
        </Card>
      </>}

      <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          بنود العقد أصناف من <strong>منتجات البيع ← التعاقدات والمدارس</strong>.
          والتكلفة الحقيقية تأتي من <strong>المنصرف</strong> حين تُصرف الخامات على العقد —
          فتُقارن بقيمته وتظهر ربحيته.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <FileSignature size={40} className="mb-3 opacity-40" />
          <p>{q ? "لا توجد نتائج مطابقة" : "لا توجد عقود بعد"}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((c) => {
            const cost = costByContract.get(c.id) ?? 0;
            const operation = operating[c.id];
            const sales = operation?.sales ?? 0;
            const operatingExpenses = operation?.expenses ?? 0;
            const vatRate = c.vatRate ?? 15;
            const net = r2((c.totalValue ?? 0) / (1 + vatRate / 100));
            const operatingNet = r2(sales - cost - operatingExpenses);
            const st = STATUS[c.status] ?? STATUS.active;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      {c.contractNumber != null && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          #{String(c.contractNumber).padStart(3, "0")}
                        </span>
                      )}
                      {c.name}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.contractType === "collected" ? "bg-blue-50 text-blue-700" : c.contractType === "paid" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {c.contractType === "collected" ? "محصّل · سعر التكلفة" : c.contractType === "paid" ? "مدفوع · سعر البيع" : "عقد سابق"}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 tabular-nums-auto">
                      <CalendarDays size={11} />
                      {c.startDate} ← {c.endDate}
                      {fc.client && c.clientName && ` · ${c.clientName}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{contractPricingDescription(c)}</p>
                    {fc.actor && <Actor uid={c.createdBy} className="mt-0.5" />}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canLedger && (
                      <Link href={`/admin/contracts/${c.id}`}
                        className="p-1.5 text-slate-400 hover:text-[#1C2D50]" title="الجدول اليومي">
                        <Table2 size={14} />
                      </Link>
                    )}
                    {canEdit && c.status === "active" && (
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-[#1C2D50]" title="تعديل">
                        <Pencil size={14} />
                      </button>
                    )}
                    {canComplete && c.status === "active" && (
                      <button onClick={() => run(() => completeContract(c.id), "أُنهي العقد")}
                        className="p-1.5 text-slate-400 hover:text-emerald-600" title="إنهاء العقد">
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    {canEdit && c.status === "completed" && (
                      <button onClick={() => setReopenTarget(c)}
                        className="p-1.5 text-slate-400 hover:text-amber-600" title="إرجاع العقد إلى ساري">
                        <RotateCcw size={14} />
                      </button>
                    )}
                    {canCancel && c.status !== "cancelled" && (
                      <button onClick={() => { setCancelTarget(c); setCancelReason(""); }}
                        className="p-1.5 text-slate-400 hover:text-red-500" title="إلغاء">
                        <Ban size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(c)} className="p-1.5 text-slate-400 hover:text-red-500" title="حذف">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {fc.value && <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
                  {[
                    { l: "قيمة الاتفاق", v: money(c.totalValue ?? 0), cls: "text-slate-800", hint: `الصافي قبل الضريبة ${money(net)}` },
                    { l: "مبيعات التشغيل", v: money(sales), cls: "text-blue-700", hint: `${operation?.days ?? 0} يوم مسجّل` },
                    { l: "تحصيل التشغيل", v: money(operation?.collected ?? 0), cls: "text-emerald-700", hint: `${money(c.paid ?? 0)} مرحّل` },
                    { l: "تكلفة الخامات", v: money(cost), cls: "text-orange-700", hint: "من المنصرف الفعلي" },
                    { l: "مصروفات التشغيل", v: money(operatingExpenses), cls: "text-orange-700", hint: "من الأيام المسجّلة" },
                    { l: "صافي التشغيل", v: money(operatingNet), cls: operatingNet >= 0 ? "text-emerald-700" : "text-red-600", hint: "مبيعات − خامات − مصروفات" },
                  ].map((x) => (
                    <div key={x.l} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] text-slate-500">{x.l}</p>
                      <p className={`font-bold tabular-nums-auto ${x.cls}`}>{x.v}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-400" title={x.hint}>{x.hint}</p>
                    </div>
                  ))}
                </div>}

                {c.terms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                    {c.terms.map((t) => (
                      <span key={t.barcode} className="text-[11px] bg-[#EEF1F7] text-[#1C2D50] px-2 py-0.5 rounded-full tabular-nums-auto">
                        {t.itemName} × {t.quantity.toLocaleString("en-US")}
                        {t.unitPrice > 0 && ` @ ${money(t.unitPrice)}`}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* إنشاء / تعديل */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editTarget ? `تعديل العقد: ${editTarget.name}` : "عقد جديد"} size="xl">
        <div className="space-y-4">
          <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3" disabled={!!editTarget}>
            <legend className="px-1 text-sm font-semibold">نوع العقد *</legend>
            <div className="grid grid-cols-2 gap-3">
              {([ ["collected", "محصّل", "الأصناف بسعر التكلفة"], ["paid", "مدفوع", "الأصناف بسعر البيع حسب القسم"] ] as const).map(([value, label, hint]) => (
                <label key={value} className={`rounded-lg border p-3 cursor-pointer ${contractType === value ? "border-[#1C2D50] bg-[#EEF1F7]" : "border-slate-200"}`}>
                  <input type="radio" name="contractType" value={value} checked={contractType === value}
                    onChange={() => { setContractType(value); setPriceSectionId(""); setTerms([]); }} className="me-2" />
                  <span className="font-semibold text-sm">{label}</span>
                  <span className="block text-xs text-slate-500 mt-1">{hint}</span>
                </label>
              ))}
            </div>
            {contractType === "paid" && <Select label="قسم سعر البيع" required value={priceSectionId}
              onChange={(e) => { setPriceSectionId(e.target.value); setTerms([]); }}>
              <option value="">اختر القسم</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              {editTarget?.priceSectionId && !sections.some((s) => s.id === editTarget.priceSectionId) &&
                <option value={editTarget.priceSectionId}>{editTarget.priceSectionName ?? "القسم المحفوظ"}</option>}
            </Select>}
          </fieldset>
          <p className="text-xs text-slate-500">
            {editTarget ? "نوع العقد وقسم السعر ثابتان بعد الإنشاء. أسعار البنود السابقة محفوظة، والبنود الجديدة تأخذ السعر الحالي."
              : "السعر يُجلب تلقائياً ويُحفظ للعقد ويُستخدم في الجدول اليومي. تغيير النوع أو القسم يعيد اختيار البنود."}
            {editTarget && !contractType && " هذا عقد سابق يحتفظ بأسعاره اليدوية."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="اسم الجهة" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: معهد أرامكو" />
            <Input label="المسؤول / العميل" value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            <Input label="الجوال" value={form.clientPhone}
              onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            <Input label="نسبة الضريبة (%)" type="number" min={0} max={100} value={form.vatRate}
              onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
            <Input label="بداية العقد" type="date" required value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <Input label="نهاية العقد" type="date" required value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>

          {/* البنود — صلاحية مستقلة: من يعدّل بيانات العقد قد لا يُسمح له بأسعاره */}
          {canTerms && <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">بنود العقد</label>
              <span className="text-xs text-slate-500 tabular-nums-auto">
                مجموع البنود: <strong className="text-[#1C2D50]">{money(draftTotal)}</strong> ريال
                {draftCost > 0 && ` · تكلفتها التقديرية ${money(draftCost)}`}
              </span>
            </div>

            {terms.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {terms.map((t) => {
                  const item = items.find((i) => i.id === t.barcode);
                  return (
                    <div key={t.barcode} className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                      <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{item?.name ?? t.barcode}</span>
                      <input type="number" min={0} step="0.5" value={t.quantity} placeholder="الكمية"
                        onChange={(e) => setTerms((p) => p.map((x) => x.barcode === t.barcode ? { ...x, quantity: e.target.value } : x))}
                        className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                      <span className="text-[11px] text-slate-500 w-9 shrink-0">{item?.unit}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">×</span>
                      <input type="number" min={0} step="0.01" value={t.unitPrice} placeholder="السعر"
                        readOnly={!!contractType} aria-label={contractPriceLabel(contractType || undefined)}
                        onChange={(e) => setTerms((p) => p.map((x) => x.barcode === t.barcode ? { ...x, unitPrice: e.target.value } : x))}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                      <span className="text-xs font-bold text-[#1C2D50] w-20 text-left tabular-nums-auto shrink-0">
                        {money((parseFloat(t.quantity) || 0) * (parseFloat(t.unitPrice) || 0))}
                      </span>
                      <button onClick={() => toggleTerm(t.barcode)} className="text-slate-300 hover:text-red-500 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="relative mb-2">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={termSearch} onChange={(e) => setTermSearch(e.target.value)}
                placeholder="ابحث في أصناف التعاقدات..."
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>

            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {termChoices.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">
                  {contractItems.length === 0
                    ? contractType === "paid" && !priceSectionId
                      ? "اختر قسم سعر البيع لعرض أصنافه"
                      : contractType === "paid"
                        ? "لا توجد أصناف مرتبطة بالقسم المختار — حدّدها من منتجات البيع"
                        : "لا توجد أصناف تحت «التعاقدات والمدارس» — حدّدها من منتجات البيع"
                    : "لا توجد نتائج مطابقة"}
                </p>
              ) : termChoices.map((i) => {
                const on = terms.some((t) => t.barcode === i.id);
                const source = sourcePrice(i.id);
                return (
                  <button key={i.id} type="button" onClick={() => toggleTerm(i.id)}
                    disabled={!on && (!editTarget && !contractType || !!contractType && !!source.error)}
                    className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5">
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      on ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300"
                    }`}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{i.name}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums-auto shrink-0 max-w-[50%]">
                      {contractType ? source.error ?? `${contractPriceLabel(contractType)} ${money(source.price ?? 0)} / ${i.unit}` : `تكلفته ${money(averageCost(i))} / ${i.unit}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="قيمة العقد شاملة الضريبة" type="number" min={0} step="0.01"
              value={form.totalValue} onChange={(e) => setForm({ ...form, totalValue: e.target.value })}
              helperText={draftTotal > 0 ? `اتركه فارغاً ليأخذ مجموع البنود (${money(draftTotal)})` : "اتركه فارغاً ليأخذ مجموع البنود"} />
            <Textarea label="ملاحظات" rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave} loading={saving}>
              {editTarget ? "حفظ التعديلات" : "إنشاء العقد"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* إلغاء */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="إلغاء العقد" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            سيُلغى عقد «{cancelTarget?.name}». ما صُرف عليه من خامات يبقى مسجّلاً كتكلفة حقيقية.
          </p>
          <Input label="سبب الإلغاء" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>تراجع</Button>
            <Button variant="danger" loading={saving}
              onClick={() => cancelTarget && run(() => cancelContract(cancelTarget.id, cancelReason), "أُلغي العقد")}>
              إلغاء العقد
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && run(() => deleteContract(deleteTarget.id), "حُذف العقد")}
        title="حذف العقد"
        message={`سيُحذف عقد «${deleteTarget?.name}» ودفعاته. لا يمكن الحذف إن صُرفت عليه خامات — استعمل الإلغاء حينها.`}
        confirmLabel="حذف"
        loading={saving}
      />

      <ConfirmModal
        open={!!reopenTarget}
        onClose={() => setReopenTarget(null)}
        onConfirm={() => reopenTarget && run(() => reopenContract(reopenTarget.id), "أُعيد فتح العقد")}
        title="إعادة فتح العقد"
        message={`سيعود عقد «${reopenTarget?.name}» إلى حالة «ساري». لن تُحذف الدفعات أو الأيام أو تكاليف الخامات المسجلة.`}
        confirmLabel="إعادة فتح العقد"
        loading={saving}
      />
    </div>
  );
}
