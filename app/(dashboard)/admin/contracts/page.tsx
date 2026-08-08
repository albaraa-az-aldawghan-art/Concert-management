"use client";

/* التعاقدات: عقود الجهات بمددها وبنودها، وتكلفة ما صُرف عليها وربحيتها. */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox } from "@/components/ui/list-filters";
import { Actor } from "@/components/ui/actor";
import {
  getContracts, addContract, updateContract, cancelContract,
  completeContract, deleteContract, ContractDraft, termsTotal,
} from "@/lib/firestore/contracts";
import { getCostItems, getCostOutgoing } from "@/lib/firestore/costs";
import { getSectionsOfChannel, itemsOfSection } from "@/lib/firestore/sales";
import { averageCost } from "@/lib/recipes";
import { Contract, CostItem, CostOutgoing, SalesSection } from "@/types";
import {
  FileSignature, Plus, Trash2, Pencil, X, Check, Info, CalendarDays,
  Search, Ban, CheckCircle2, TrendingUp,
} from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Contract | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Contract | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);

  const [form, setForm] = useState({
    name: "", clientName: "", clientPhone: "",
    startDate: "", endDate: "", totalValue: "", vatRate: "15", notes: "",
  });
  const [terms, setTerms] = useState<TermDraft[]>([]);
  const [termSearch, setTermSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [c, i, s, o] = await Promise.all([
      getContracts().catch(() => [] as Contract[]),
      getCostItems().catch(() => [] as CostItem[]),
      getSectionsOfChannel("contracts").catch(() => [] as SalesSection[]),
      getCostOutgoing().catch(() => [] as CostOutgoing[]),
    ]);
    setContracts(c);
    setItems(i);
    setSections(s);
    setOutgoing(o);
    setLoading(false);
  }

  /** أصناف قناة التعاقدات وحدها — البنود منها لا من كل التكاليف */
  const contractItems = items.filter((i) =>
    sections.some((s) => (i.salesSections ?? []).includes(s.id))
  );

  /** ما صُرف فعلاً على كل عقد — التكلفة الحقيقية لا المقدّرة */
  const costByContract = new Map<string, number>();
  for (const o of outgoing) {
    if (!o.contractId) continue;
    costByContract.set(o.contractId, (costByContract.get(o.contractId) ?? 0) + (o.totalCost ?? 0));
  }

  function openAdd() {
    setEditTarget(null);
    const today = new Date().toISOString().slice(0, 10);
    setForm({ name: "", clientName: "", clientPhone: "", startDate: today, endDate: "", totalValue: "", vatRate: "15", notes: "" });
    setTerms([]);
    setTermSearch("");
    setShowForm(true);
  }

  function openEdit(c: Contract) {
    setEditTarget(c);
    setForm({
      name: c.name, clientName: c.clientName ?? "", clientPhone: c.clientPhone ?? "",
      startDate: c.startDate, endDate: c.endDate,
      totalValue: String(c.totalValue ?? ""), vatRate: String(c.vatRate ?? 15), notes: c.notes ?? "",
    });
    setTerms(c.terms.map((t) => ({ barcode: t.barcode, quantity: String(t.quantity), unitPrice: String(t.unitPrice) })));
    setTermSearch("");
    setShowForm(true);
  }

  function toggleTerm(barcode: string) {
    setTerms((prev) =>
      prev.some((t) => t.barcode === barcode)
        ? prev.filter((t) => t.barcode !== barcode)
        : [...prev, { barcode, quantity: "1", unitPrice: "" }]
    );
  }

  const draftTotal = r2(
    terms.reduce((s, t) => s + (parseFloat(t.quantity) || 0) * (parseFloat(t.unitPrice) || 0), 0)
  );
  const draftCost = r2(
    terms.reduce((s, t) => {
      const item = items.find((i) => i.id === t.barcode);
      return s + (parseFloat(t.quantity) || 0) * averageCost(item);
    }, 0)
  );

  async function handleSave() {
    const draft: ContractDraft = {
      name: form.name.trim(),
      clientName: form.clientName.trim() || null,
      clientPhone: form.clientPhone.trim() || null,
      startDate: form.startDate,
      endDate: form.endDate,
      vatRate: parseFloat(form.vatRate) || 15,
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
    (c) => !q || c.name.includes(q) || (c.clientName ?? "").includes(q) ||
      String(c.contractNumber ?? "").includes(q)
  );

  const tq = termSearch.trim();
  const termChoices = contractItems.filter((i) => !tq || i.name.includes(tq) || i.id.includes(tq));

  /* مجاميع الصفحة */
  const active = contracts.filter((c) => c.status === "active");
  const totalValue = r2(active.reduce((s, c) => s + (c.totalValue ?? 0), 0));
  const totalPaid = r2(active.reduce((s, c) => s + (c.paid ?? 0), 0));
  const totalCost = r2(active.reduce((s, c) => s + (costByContract.get(c.id) ?? 0), 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSignature size={20} className="text-[#1C2D50]" />
            التعاقدات
          </h2>
          <p className="text-sm text-slate-500">{contracts.length} عقد · {active.length} ساري</p>
        </div>
        {canCreate && (
          <Button onClick={openAdd}>
            <Plus size={16} /> عقد جديد
          </Button>
        )}
      </div>

      {/* مجاميع العقود السارية */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[
          { l: "قيمة العقود السارية", v: totalValue, cls: "text-[#1C2D50]" },
          { l: "المحصَّل", v: totalPaid, cls: "text-emerald-700" },
          { l: "المتبقي", v: r2(totalValue - totalPaid), cls: "text-orange-700" },
          { l: "تكلفة الخامات المصروفة", v: totalCost, cls: "text-slate-700" },
        ].map((s) => (
          <Card key={s.l}>
            <p className="text-xs text-slate-500">{s.l}</p>
            <p className={`text-lg font-bold tabular-nums-auto mt-1 ${s.cls}`}>{money(s.v)} ريال</p>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          بنود العقد أصناف من <strong>منتجات البيع ← التعاقدات والمدارس</strong>.
          والتكلفة الحقيقية تأتي من <strong>المنصرف</strong> حين تُصرف الخامات على العقد —
          فتُقارن بقيمته وتظهر ربحيته.
        </p>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم الجهة أو العميل أو رقم العقد..." />

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
            const vatRate = c.vatRate ?? 15;
            const net = r2((c.totalValue ?? 0) / (1 + vatRate / 100));
            const profit = r2(net - cost);
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
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 tabular-nums-auto">
                      <CalendarDays size={11} />
                      {c.startDate} ← {c.endDate}
                      {fc.client && c.clientName && ` · ${c.clientName}`}
                    </p>
                    {fc.actor && <Actor uid={c.createdBy} className="mt-0.5" />}
                  </div>
                  <div className="flex gap-1 shrink-0">
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

                {fc.value && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {[
                    { l: "قيمة العقد", v: money(c.totalValue ?? 0), cls: "text-slate-800" },
                    { l: "الصافي قبل الضريبة", v: money(net), cls: "text-slate-800" },
                    { l: "المحصَّل", v: money(c.paid ?? 0), cls: "text-emerald-700" },
                    { l: "تكلفة الخامات", v: money(cost), cls: "text-slate-700" },
                    { l: "الربح", v: money(profit), cls: profit >= 0 ? "text-emerald-700" : "text-red-600" },
                  ].map((x) => (
                    <div key={x.l} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] text-slate-500">{x.l}</p>
                      <p className={`font-bold tabular-nums-auto ${x.cls}`}>{x.v}</p>
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
                    ? "لا توجد أصناف تحت «التعاقدات والمدارس» — حدّدها من منتجات البيع"
                    : "لا توجد نتائج مطابقة"}
                </p>
              ) : termChoices.map((i) => {
                const on = terms.some((t) => t.barcode === i.id);
                return (
                  <button key={i.id} type="button" onClick={() => toggleTerm(i.id)}
                    className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5">
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      on ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300"
                    }`}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{i.name}</span>
                    <span className="text-[11px] text-slate-400 tabular-nums-auto shrink-0">
                      تكلفته {money(averageCost(i))} / {i.unit}
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
    </div>
  );
}
