"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostOutgoing, addCostOutgoing, deleteCostOutgoing, getCostItemByBarcode, getCostSettings } from "@/lib/firestore/costs";
import { getConcerts } from "@/lib/firestore/concerts";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { BarcodeScanInput } from "@/components/ui/barcode-scan-input";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { CostOutgoing, CostItem, CostSettings, Concert } from "@/types";
import { Plus, PackageMinus, Trash2, CheckCircle2, Music } from "lucide-react";

const PAGE_SIZE = 10;

export default function CostsOutgoingPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canRecord = isAdmin || feat("costs", "record_outgoing");

  const [entries, setEntries] = useState<CostOutgoing[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [] });
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
  const [form, setForm] = useState({ quantity: "", unitPrice: "", departmentName: "", dispenseDate: "" });
  const [concertMode, setConcertMode] = useState<"registered" | "manual">("registered");
  const [concertSearch, setConcertSearch] = useState("");
  const [pickedConcert, setPickedConcert] = useState<Concert | null>(null);
  const [manualConcertName, setManualConcertName] = useState("");

  useEffect(() => { setPage(1); }, [search, dateF, deptFilter]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [e, s, c] = await Promise.all([getCostOutgoing(), getCostSettings(), getConcerts()]);
    setEntries(e);
    setSettings(s);
    setConcerts(c);
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
    setShowAdd(true);
  }

  async function handleScan(barcode: string) {
    const item = await getCostItemByBarcode(barcode);
    if (!item) {
      showToast("لم يُعثر على صنف بهذا الباركود — سجّله أولاً من صفحة أصناف التكاليف", "error");
      return;
    }
    setScannedItem(item);
    // متوسط سعر التكلفة = إجمالي قيمة الوارد ÷ إجمالي كمية الوارد لهذا الصنف
    const avgPrice = item.totalIn > 0 ? (item.totalInValue ?? 0) / item.totalIn : 0;
    setForm((prev) => ({ ...prev, unitPrice: avgPrice > 0 ? avgPrice.toFixed(2) : "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !scannedItem) return;
    const quantity = parseFloat(form.quantity);
    const unitPrice = parseFloat(form.unitPrice);
    if (!quantity || quantity <= 0) { showToast("أدخل كمية صحيحة", "error"); return; }
    if (!form.departmentName) { showToast("اختر القسم", "error"); return; }
    if (!form.dispenseDate) { showToast("أدخل تاريخ الصرف", "error"); return; }
    setSaving(true);
    try {
      await addCostOutgoing({
        itemBarcode: scannedItem.id,
        quantity,
        unitPrice: unitPrice || 0,
        departmentName: form.departmentName,
        concertId: selectedDept?.concertLinked && concertMode === "registered" ? pickedConcert?.id ?? null : null,
        concertName: selectedDept?.concertLinked && concertMode === "registered" ? pickedConcert?.name ?? null : null,
        manualConcertName: selectedDept?.concertLinked && concertMode === "manual" ? manualConcertName.trim() || null : null,
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

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCostOutgoing(deleteTarget);
      showToast("تم حذف العملية");
      setDeleteTarget(null);
      load();
    } catch {
      showToast("حدث خطأ", "error");
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
    .filter((e) => !q || e.itemName.includes(q) || e.itemBarcode.includes(q) || (e.concertName ?? "").includes(q) || (e.manualConcertName ?? "").includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const total = parseFloat(form.quantity || "0") * parseFloat(form.unitPrice || "0");
  const cq = concertSearch.trim().toLowerCase();
  const filteredConcerts = cq
    ? concerts.filter((c) => c.name.toLowerCase().includes(cq) || String(c.concertNumber ?? "").includes(cq))
    : concerts.slice(0, 20);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف أو الحفلة أو الباركود..." />
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
                {isAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3 font-semibold text-slate-800">{e.itemName}</td>
                  <td className="px-4 py-3 text-slate-600">{e.unit}</td>
                  <td className="px-4 py-3 tabular-nums-auto">{e.quantity.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-slate-600">{e.concertName || e.manualConcertName || e.departmentName}</td>
                  <td className="px-4 py-3 tabular-nums-auto text-slate-500">{e.dispenseDate ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{e.totalCost.toLocaleString("en-US")} ريال</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteTarget(e)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
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
          <BarcodeScanInput onScan={handleScan} />
          {scannedItem ? (
            <>
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
                        <input type="text" value={pickedConcert ? pickedConcert.name : concertSearch}
                          onChange={(e) => { setPickedConcert(null); setConcertSearch(e.target.value); }}
                          placeholder="ابحث باسم الحفلة أو رقمها..."
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                        {!pickedConcert && concertSearch && (
                          <div className="mt-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                            {filteredConcerts.length === 0 ? (
                              <p className="text-xs text-slate-400 p-2.5">لا توجد نتائج</p>
                            ) : filteredConcerts.map((c) => (
                              <button key={c.id} type="button" onClick={() => { setPickedConcert(c); setConcertSearch(""); }}
                                className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                                <Music size={13} className="text-slate-400 shrink-0" />
                                <span className="truncate">{c.name}</span>
                                {c.concertNumber != null && <span className="text-[10px] text-slate-400 mr-auto">#{String(c.concertNumber).padStart(3, "0")}</span>}
                              </button>
                            ))}
                          </div>
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
            <p className="text-xs text-slate-400 text-center py-2">امسح باركود الصنف أعلاه للمتابعة</p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف عملية المنصرف"
        message={`سيُعاد ${deleteTarget?.quantity} ${deleteTarget?.unit} إلى رصيد "${deleteTarget?.itemName}". متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
