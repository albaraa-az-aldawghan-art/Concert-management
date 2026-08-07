"use client";

/* المنصرف: صرف الخامات على الأقسام والحفلات، وتسوية المرتجع والتالف. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostOutgoing, addCostOutgoing, deleteCostOutgoing, settleCostOutgoing, getCostItems, getCostSettings } from "@/lib/firestore/costs";
import { getConcerts } from "@/lib/firestore/concerts";
import { getContracts } from "@/lib/firestore/contracts";
import { useToast } from "@/components/ui/toast";
import { Actor } from "@/components/ui/actor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { CostItemPicker } from "@/components/ui/cost-item-picker";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { formatDate } from "@/lib/utils";
import { averageCost } from "@/lib/recipes";
import { normalizeStatus, statusColor, statusLabel } from "@/lib/concert-status";
import { CostOutgoing, CostItem, CostSettings, Concert, Contract } from "@/types";
import { Plus, PackageMinus, Trash2, CheckCircle2, Music, AlertTriangle, Undo2 } from "lucide-react";

const PAGE_SIZE = 10;

export default function CostsOutgoingPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canRecord = isAdmin || feat("costs", "record_outgoing");

  const [entries, setEntries] = useState<CostOutgoing[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [] });
  const [items, setItems] = useState<CostItem[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [scannedItem, setScannedItem] = useState<CostItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CostOutgoing | null>(null);
  const [settleTarget, setSettleTarget] = useState<CostOutgoing | null>(null);
  const [settleForm, setSettleForm] = useState({ returned: "", damaged: "", reason: "", date: "" });
  const [form, setForm] = useState({ quantity: "", unitPrice: "", departmentName: "", dispenseDate: "" });
  const [concertMode, setConcertMode] = useState<"registered" | "manual">("registered");
  const [concertSearch, setConcertSearch] = useState("");
  const [pickedConcert, setPickedConcert] = useState<Concert | null>(null);
  const [manualConcertName, setManualConcertName] = useState("");
  /* أقسام التعاقدات تطالب باختيار عقد كما تطالب أقسام الحفلات بحفلة */
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [pickedContract, setPickedContract] = useState<Contract | null>(null);
  const [contractSearch, setContractSearch] = useState("");

  useEffect(() => { setPage(1); }, [search, dateF, deptFilter]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [e, s, c, i, ct] = await Promise.all([
      getCostOutgoing(), getCostSettings(), getConcerts(), getCostItems().catch(() => [] as CostItem[]),
      getContracts().catch(() => [] as Contract[]),
    ]);
    setContracts(ct);
    setEntries(e);
    setSettings(s);
    setConcerts(c);
    setItems(i);
    setLoading(false);
  }

  const selectedDept = settings.departments.find((d) => d.name === form.departmentName);

  function openAdd() {
    setScannedItem(null);
    setForm({ quantity: "", unitPrice: "", departmentName: settings.departments[0]?.name ?? "", dispenseDate: new Date().toISOString().slice(0, 10) });
    setConcertMode("registered");
    setConcertSearch("");
    setPickedConcert(null);
    setManualConcertName("");
    setPickedContract(null);
    setContractSearch("");
    setShowAdd(true);
  }

  function pickItem(item: CostItem) {
    setScannedItem(item);
    // متوسط سعر التكلفة يُعبَّأ تلقائياً ويبقى قابلاً للتعديل
    const avg = averageCost(item);
    setForm((prev) => ({ ...prev, unitPrice: avg > 0 ? avg.toFixed(2) : "" }));
  }

  function handleScanMiss() {
    showToast("لم يُعثر على صنف بهذا الباركود — سجّله أولاً من صفحة أصناف التكاليف", "error");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !scannedItem) return;
    const quantity = parseFloat(form.quantity);
    const unitPrice = parseFloat(form.unitPrice);
    if (!quantity || quantity <= 0) { showToast("أدخل كمية صحيحة", "error"); return; }
    if (!form.departmentName) { showToast("اختر القسم", "error"); return; }
    if (!form.dispenseDate) { showToast("أدخل تاريخ الصرف", "error"); return; }
    if (selectedDept?.contractLinked && !pickedContract) {
      showToast("اختر العقد الذي تُحمَّل عليه التكلفة", "error");
      return;
    }
    setSaving(true);
    try {
      await addCostOutgoing({
        itemBarcode: scannedItem.id,
        quantity,
        unitPrice: unitPrice || 0,
        departmentName: form.departmentName,
        concertId: selectedDept?.concertLinked && concertMode === "registered" ? pickedConcert?.id ?? null : null,
        concertName: selectedDept?.concertLinked && concertMode === "registered" ? pickedConcert?.name ?? null : null,
        clientName: selectedDept?.concertLinked && concertMode === "registered" ? pickedConcert?.clientName ?? null : null,
        manualConcertName: selectedDept?.concertLinked && concertMode === "manual" ? manualConcertName.trim() || null : null,
        contractId: selectedDept?.contractLinked ? pickedContract?.id ?? null : null,
        contractName: selectedDept?.contractLinked ? pickedContract?.name ?? null : null,
        dispenseDate: form.dispenseDate,
        createdBy: appUser.uid,
      });
      showToast("تم تسجيل عملية المنصرف");
      setShowAdd(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  function openSettle(e: CostOutgoing) {
    setSettleTarget(e);
    setSettleForm({ returned: "", damaged: "", reason: "", date: new Date().toISOString().slice(0, 10) });
  }

  async function handleSettle() {
    if (!appUser || !settleTarget) return;
    const returned = parseFloat(settleForm.returned) || 0;
    const damaged = parseFloat(settleForm.damaged) || 0;
    if (returned + damaged <= 0) { showToast("أدخل كمية مرتجعة أو تالفة", "error"); return; }
    if (damaged > 0 && !settleForm.reason.trim()) { showToast("اكتب سبب التلف", "error"); return; }
    setSaving(true);
    try {
      await settleCostOutgoing(settleTarget, {
        returnedQty: returned,
        damagedQty: damaged,
        reason: settleForm.reason.trim(),
        damageDate: settleForm.date,
        createdBy: appUser.uid,
      });
      showToast(damaged > 0 ? "سُجّل المرتجع والتالف" : "رجعت الكمية للمخزون");
      setSettleTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCostOutgoing(deleteTarget);
      showToast("تم حذف العملية");
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
  const filtered = entries
    .filter((e) => matchesDate(e.dispenseDate ?? e.createdAt, dateF))
    .filter((e) => !deptFilter || e.departmentName === deptFilter)
    .filter((e) => !q || e.itemName.includes(q) || e.itemBarcode.includes(q) || (e.concertName ?? "").includes(q) || (e.clientName ?? "").includes(q) || (e.manualConcertName ?? "").includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const total = parseFloat(form.quantity || "0") * parseFloat(form.unitPrice || "0");

  // العقود السارية وحدها تقبل تحميل تكلفة — الملغى والمنتهي لا
  const cqs = contractSearch.trim();
  const activeContracts = contracts
    .filter((c) => c.status === "active")
    .filter((c) => !cqs || c.name.includes(cqs) || (c.clientName ?? "").includes(cqs))
    .slice(0, 30);

  // عمليات صرف باسم مكتوب يدوياً — لا تظهر في تكلفة أي حفلة، فنُظهر حجمها
  // كي لا يكون النقص في حساب الربحية خفياً
  const orphanEntries = entries.filter((e) => !e.concertId && e.manualConcertName);
  const orphanTotal = orphanEntries.reduce((s, e) => s + e.totalCost, 0);

  // الحفلات المتاحة للربط: الملغاة مستبعدة، والأحدث تاريخاً أولاً
  const cq = concertSearch.trim().toLowerCase();
  const numQ = concertSearch.trim().replace(/^#/, "");
  const selectableConcerts = concerts
    .filter((c) => normalizeStatus(c.status) !== "cancelled")
    .sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0));
  const filteredConcerts = (cq
    ? selectableConcerts.filter(
        (c) =>
          c.name.toLowerCase().includes(cq) ||
          (c.clientName ?? "").toLowerCase().includes(cq) ||
          (c.venueName ?? "").toLowerCase().includes(cq) ||
          (c.concertNumber != null && String(c.concertNumber).padStart(3, "0").includes(numQ))
      )
    : selectableConcerts
  ).slice(0, 30);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">المنصرف</h2>
          <p className="text-sm text-slate-500">{entries.length} عملية منصرف مسجّلة</p>
        </div>
        {canRecord && (
          <Button onClick={openAdd}>
            <Plus size={16} /> تسجيل منصرف جديد
          </Button>
        )}
      </div>

      {/* عمليات باسم مكتوب يدوياً لا تُحتسب على أي حفلة — نُظهر حجم النقص */}
      {orphanEntries.length > 0 && (
        <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-orange-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-orange-800">
              {orphanEntries.length} عملية صرف باسم مكتوب يدوياً — بإجمالي{" "}
              <span className="tabular-nums-auto">{orphanTotal.toLocaleString("en-US")}</span> ريال
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              هذه المبالغ لا تظهر ضمن تكلفة أي حفلة. اختر الحفلة من القائمة بدل كتابة الاسم لتُحتسب عليها.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف أو العميل أو الحفلة أو الباركود..." />
      </div>
      <div className="flex gap-2 flex-wrap">
        {["", ...settings.departments.map((d) => d.name)].map((d) => (
          <button key={d || "all"} onClick={() => setDeptFilter(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${deptFilter === d ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {d || "كل الأقسام"}
          </button>
        ))}
      </div>
      <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بتاريخ الصرف" matchedCount={filtered.length} unitLabel="عملية" />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <PackageMinus size={40} className="mb-3 opacity-40" />
          <p>لا توجد عمليات منصرف مطابقة</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                <th className="px-4 py-3 font-semibold">القسم / الحفلة</th>
                <th className="px-4 py-3 font-semibold">تاريخ الصرف</th>
                <th className="px-4 py-3 font-semibold">الإجمالي</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3 font-semibold text-slate-800">{e.itemName}</td>
                  <td className="px-4 py-3 text-slate-600">{e.unit}</td>
                  <td className="px-4 py-3 tabular-nums-auto">
                    {e.quantity.toLocaleString("en-US")}
                    {((e.returnedQty ?? 0) > 0 || (e.damagedQty ?? 0) > 0) && (
                      <span className="block text-[10px]">
                        {(e.returnedQty ?? 0) > 0 && (
                          <span className="text-emerald-600">مرتجع {e.returnedQty!.toLocaleString("en-US")}</span>
                        )}
                        {(e.returnedQty ?? 0) > 0 && (e.damagedQty ?? 0) > 0 && <span className="text-slate-300"> · </span>}
                        {(e.damagedQty ?? 0) > 0 && (
                          <span className="text-red-600">تالف {e.damagedQty!.toLocaleString("en-US")}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.contractId ? (
                      <>
                        <span className="text-slate-800">{e.contractName}</span>
                        <span className="block text-[10px] text-slate-400">عقد · {e.departmentName}</span>
                      </>
                    ) : e.concertId ? (
                      <>
                        <span className="text-slate-800">{e.clientName || e.concertName}</span>
                        <span className="block text-[10px] text-slate-400">{e.departmentName}</span>
                      </>
                    ) : e.manualConcertName ? (
                      <span className="inline-flex items-center gap-1 text-orange-600" title="غير مرتبط بحفلة — لا يدخل في تكلفتها">
                        <AlertTriangle size={11} /> {e.manualConcertName}
                      </span>
                    ) : (
                      e.departmentName
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto text-slate-500">
                    {e.dispenseDate ?? "—"}
                    <Actor uid={e.createdBy} className="block mt-0.5" showIcon={false} />
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{e.totalCost.toLocaleString("en-US")} ريال</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canRecord && e.quantity - (e.returnedQty ?? 0) - (e.damagedQty ?? 0) > 0 && (
                        <button onClick={() => openSettle(e)} title="إرجاع للمخزون أو تسجيل تالف"
                          className="text-slate-400 hover:text-emerald-600 transition-colors">
                          <Undo2 size={14} />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(e)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

      {/* Add */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="تسجيل منصرف جديد">
        <div className="space-y-4">
          <CostItemPicker items={items} onPick={pickItem} onScanMiss={handleScanMiss} showBalance />
          {scannedItem ? (
            <>
              {/* مادة منتهية الصلاحية: التحذير هنا لا في تقرير يُفتح لاحقاً،
                  لأن لحظة الصرف هي آخر فرصة لإيقافها قبل أن تصل للعميل */}
              {scannedItem.expiryDate && scannedItem.expiryDate < new Date().toISOString().slice(0, 10) && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">
                      انتهت صلاحية هذا الصنف في {scannedItem.expiryDate}
                    </p>
                    <p className="text-xs text-red-600 leading-relaxed mt-0.5">
                      لا تصرفه لحفلة. إن كان فاسداً فسجّله من صفحة <strong>التالف</strong> ليخرج من الرصيد كخسارة،
                      وإن كان التاريخ خاطئاً فصحّحه من صفحة أصناف التكاليف.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <span className="font-bold text-slate-800 text-sm">{scannedItem.name}</span>
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                  <CheckCircle2 size={13} /> الرصيد: {(scannedItem.totalIn ?? 0) - (scannedItem.totalOut ?? 0)} {scannedItem.unit}
                </span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">الوحدة</label>
                    <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-600 flex items-center justify-between">
                      {scannedItem.unit} <span className="text-[10px]">ثابتة لهذا الصنف 🔒</span>
                    </div>
                  </div>
                  <Input label={`الكمية المنصرفة (${scannedItem.unit})`} type="number" min={0} step="0.01" required
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>

                <Input label="تاريخ الصرف" type="date" required
                  value={form.dispenseDate} onChange={(e) => setForm({ ...form, dispenseDate: e.target.value })} />

                <Select label="القسم" required value={form.departmentName} onChange={(e) => setForm({ ...form, departmentName: e.target.value })}>
                  {settings.departments.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </Select>

                {selectedDept?.contractLinked && (
                  <div className="p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-600">العقد الذي تُحمَّل عليه التكلفة</p>
                    {pickedContract ? (
                      <div className="flex items-center justify-between gap-2 bg-white border border-[#D4DCE8] rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{pickedContract.name}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums-auto">
                            {pickedContract.startDate} ← {pickedContract.endDate}
                            {pickedContract.clientName ? ` · ${pickedContract.clientName}` : ""}
                          </p>
                        </div>
                        <button type="button" onClick={() => setPickedContract(null)}
                          className="text-xs text-slate-500 hover:text-red-500 shrink-0">تغيير</button>
                      </div>
                    ) : (
                      <>
                        <input type="text" value={contractSearch} onChange={(e) => setContractSearch(e.target.value)}
                          placeholder="ابحث باسم الجهة أو العميل..."
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                        <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                          {activeContracts.length === 0 ? (
                            <p className="text-xs text-slate-400 p-3 text-center">لا توجد عقود سارية</p>
                          ) : activeContracts.map((c) => (
                            <button key={c.id} type="button" onClick={() => setPickedContract(c)}
                              className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50">
                              <span className="font-semibold text-slate-800">{c.name}</span>
                              <span className="block text-[11px] text-slate-500 tabular-nums-auto">
                                {c.startDate} ← {c.endDate}{c.clientName ? ` · ${c.clientName}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {selectedDept?.concertLinked && (
                  <div className="p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 space-y-2.5">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConcertMode("registered")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${concertMode === "registered" ? "bg-[#1C2D50] text-white border-[#1C2D50]" : "bg-white text-slate-600 border-slate-200"}`}>
                        حفلة مسجّلة بالنظام
                      </button>
                      <button type="button" onClick={() => setConcertMode("manual")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${concertMode === "manual" ? "bg-[#1C2D50] text-white border-[#1C2D50]" : "bg-white text-slate-600 border-slate-200"}`}>
                        اسم يُكتب يدوياً
                      </button>
                    </div>
                    {concertMode === "registered" ? (
                      <div>
                        {pickedConcert ? (
                          <div className="flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">
                                {pickedConcert.clientName || pickedConcert.name}
                              </p>
                              <p className="text-[11px] text-slate-500 tabular-nums-auto">
                                {formatDate(pickedConcert.date)}
                                {pickedConcert.concertNumber != null && ` · #${String(pickedConcert.concertNumber).padStart(3, "0")}`}
                              </p>
                            </div>
                            <button type="button" onClick={() => setPickedConcert(null)}
                              className="text-xs text-slate-500 hover:text-red-500 shrink-0">تغيير</button>
                          </div>
                        ) : (
                          <>
                            <input type="text" value={concertSearch}
                              onChange={(e) => setConcertSearch(e.target.value)}
                              placeholder="ابحث باسم العميل أو الحفلة أو رقمها أو المكان..."
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                            <div className="mt-1.5 max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                              {filteredConcerts.length === 0 ? (
                                <p className="text-xs text-slate-400 p-2.5">لا توجد نتائج</p>
                              ) : filteredConcerts.map((c) => (
                                <button key={c.id} type="button" onClick={() => { setPickedConcert(c); setConcertSearch(""); }}
                                  className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
                                  <Music size={13} className="text-slate-400 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-slate-800 truncate">{c.clientName || c.name}</p>
                                    <p className="text-[10px] text-slate-400 tabular-nums-auto">
                                      {formatDate(c.date)}
                                      {c.venueName ? ` · ${c.venueName}` : ""}
                                    </p>
                                  </div>
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(c.status)}`}>
                                    {statusLabel(c.status)}
                                  </span>
                                  {c.concertNumber != null && (
                                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums-auto">
                                      #{String(c.concertNumber).padStart(3, "0")}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <Input value={manualConcertName} onChange={(e) => setManualConcertName(e.target.value)} placeholder="اسم صاحب الحفلة" />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Input label="سعر الصنف (للوحدة)" helperText="مُعبّأ تلقائياً بمتوسط سعر التكلفة — يمكن تعديله" type="number" min={0} step="0.01"
                    value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">إجمالي تكلفة المنصرف</label>
                    <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-[#EEF1F7] text-[#1C2D50] font-bold tabular-nums-auto">
                      {total.toLocaleString("en-US")} ريال
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
                  <Button type="submit" loading={saving}>حفظ عملية المنصرف</Button>
                </div>
              </form>
            </>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">امسح باركود الصنف أو اختره من القائمة للمتابعة</p>
          )}
        </div>
      </Modal>

      {/* إرجاع / تالف — يُستعمل غالباً بعد إلغاء حفلة صُرفت خاماتها */}
      <Modal open={!!settleTarget} onClose={() => setSettleTarget(null)} title="إرجاع أو تسجيل تالف">
        {settleTarget && (() => {
          const remaining = settleTarget.quantity - (settleTarget.returnedQty ?? 0) - (settleTarget.damagedQty ?? 0);
          const ret = parseFloat(settleForm.returned) || 0;
          const dmg = parseFloat(settleForm.damaged) || 0;
          const over = ret + dmg > remaining + 1e-9;
          const consumed = settleTarget.quantity - (settleTarget.returnedQty ?? 0) - (settleTarget.damagedQty ?? 0) - ret - dmg;
          return (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <p className="font-bold text-slate-800 text-sm">{settleTarget.itemName}</p>
                <p className="text-[11px] text-slate-500 tabular-nums-auto mt-0.5">
                  صُرف {settleTarget.quantity.toLocaleString("en-US")} {settleTarget.unit}
                  {settleTarget.clientName || settleTarget.concertName
                    ? ` · ${settleTarget.clientName || settleTarget.concertName}`
                    : ` · ${settleTarget.departmentName}`}
                  {" · "}المتبقي غير المسوّى {remaining.toLocaleString("en-US")} {settleTarget.unit}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label={`رجع للمخزون (${settleTarget.unit})`} type="number" min={0} step="0.001"
                  value={settleForm.returned} onChange={(e) => setSettleForm({ ...settleForm, returned: e.target.value })} />
                <Input label={`تالف (${settleTarget.unit})`} type="number" min={0} step="0.001"
                  value={settleForm.damaged} onChange={(e) => setSettleForm({ ...settleForm, damaged: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="سبب التلف" value={settleForm.reason} placeholder="مثال: إلغاء الحفلة وتلف الخلطة"
                  onChange={(e) => setSettleForm({ ...settleForm, reason: e.target.value })} />
                <Input label="التاريخ" type="date" value={settleForm.date}
                  onChange={(e) => setSettleForm({ ...settleForm, date: e.target.value })} />
              </div>

              {over ? (
                <p className="text-xs text-red-600 font-semibold">
                  المجموع أكبر من المتبقي ({remaining.toLocaleString("en-US")} {settleTarget.unit})
                </p>
              ) : (
                <div className="text-xs text-slate-600 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 leading-relaxed tabular-nums-auto">
                  المرتجع يعود للرصيد · التالف لا يعود ويُقيَّد خسارة عامة لا تكلفة حفلة.
                  <br />
                  ستُصبح التكلفة المحمَّلة على الحفلة{" "}
                  <span className="font-bold text-[#1C2D50]">
                    {(Math.round(consumed * settleTarget.unitPrice * 100) / 100).toLocaleString("en-US")} ريال
                  </span>{" "}
                  ({consumed.toLocaleString("en-US")} {settleTarget.unit} استُهلكت فعلاً)
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <Button variant="secondary" type="button" onClick={() => setSettleTarget(null)}>إلغاء</Button>
                <Button onClick={handleSettle} loading={saving} disabled={over || ret + dmg <= 0}>حفظ</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف عملية المنصرف"
        message={`سيُعاد ${deleteTarget ? deleteTarget.quantity - (deleteTarget.returnedQty ?? 0) : 0} ${deleteTarget?.unit} إلى رصيد "${deleteTarget?.itemName}". متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
