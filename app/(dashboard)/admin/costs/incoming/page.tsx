"use client";

/* الوارد: تسجيل المشتريات بأسعارها قبل الضريبة — منه يُبنى متوسط سعر التكلفة. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostIncoming, addCostIncoming, deleteCostIncoming, getCostItems } from "@/lib/firestore/costs";
import { useToast } from "@/components/ui/toast";
import { Actor } from "@/components/ui/actor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { CostItemPicker } from "@/components/ui/cost-item-picker";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { CostIncoming, CostItem } from "@/types";
import { Plus, PackagePlus, Trash2, CheckCircle2 } from "lucide-react";

const PAGE_SIZE = 10;

export default function CostsIncomingPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canRecord = isAdmin || feat("costs", "in_add");
  const canView = isAdmin || feat("costs", "in_view");
  const canDelete = isAdmin || feat("costs", "in_delete");
  /* الحقول: دور قد يتابع الوارد ولا يرى أسعاره */
  const fi = {
    supplier: isAdmin || feat("costs", "inf_supplier"),
    price:    isAdmin || feat("costs", "inf_price"),
    date:     isAdmin || feat("costs", "inf_date"),
    actor:    isAdmin || feat("costs", "inf_actor"),
  };

  const [entries, setEntries] = useState<CostIncoming[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [scannedItem, setScannedItem] = useState<CostItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CostIncoming | null>(null);
  const [form, setForm] = useState({ supplierName: "", invoiceDate: "", quantity: "", priceBeforeVat: "" });

  useEffect(() => { setPage(1); }, [search, dateF]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [e, i] = await Promise.all([getCostIncoming(), getCostItems().catch(() => [] as CostItem[])]);
    setEntries(e);
    setItems(i);
    setLoading(false);
  }

  function openAdd() {
    setScannedItem(null);
    setForm({ supplierName: "", invoiceDate: new Date().toISOString().slice(0, 10), quantity: "", priceBeforeVat: "" });
    setShowAdd(true);
  }

  function handleScanMiss() {
    showToast("لم يُعثر على صنف بهذا الباركود — سجّله أولاً من صفحة أصناف التكاليف", "error");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !scannedItem) return;
    const quantity = parseFloat(form.quantity);
    const price = parseFloat(form.priceBeforeVat);
    if (!quantity || quantity <= 0) { showToast("أدخل كمية صحيحة", "error"); return; }
    setSaving(true);
    try {
      await addCostIncoming({
        itemBarcode: scannedItem.id,
        supplierName: form.supplierName.trim(),
        quantity,
        priceBeforeVat: price || 0,
        invoiceDate: form.invoiceDate,
        createdBy: appUser.uid,
      });
      showToast("تم تسجيل عملية الوارد");
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
      await deleteCostIncoming(deleteTarget);
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
    .filter((e) => matchesDate(e.invoiceDate, dateF))
    .filter((e) => !q || e.itemName.includes(q) || e.supplierName.includes(q) || e.itemBarcode.includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const total = parseFloat(form.quantity || "0") * parseFloat(form.priceBeforeVat || "0");

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">الوارد</h2>
          <p className="text-sm text-slate-500">{entries.length} عملية وارد مسجّلة</p>
        </div>
        {canRecord && (
          <Button onClick={openAdd}>
            <Plus size={16} /> تسجيل وارد جديد
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف أو المورد أو الباركود..." />
      </div>
      <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بتاريخ الفاتورة" matchedCount={filtered.length} unitLabel="عملية" />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <PackagePlus size={40} className="mb-3 opacity-40" />
          <p>لا توجد عمليات وارد مطابقة</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                {fi.supplier && <th className="px-4 py-3 font-semibold">المورد</th>}
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                {fi.price && <th className="px-4 py-3 font-semibold">السعر قبل الضريبة</th>}
                {(fi.date || fi.actor) && <th className="px-4 py-3 font-semibold">التاريخ</th>}
                {fi.price && <th className="px-4 py-3 font-semibold">الإجمالي</th>}
                {canDelete && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3 font-semibold text-slate-800">{e.itemName}</td>
                  {fi.supplier && <td className="px-4 py-3 text-slate-600">{e.supplierName || "—"}</td>}
                  <td className="px-4 py-3 text-slate-600">{e.unit}</td>
                  <td className="px-4 py-3 tabular-nums-auto">{e.quantity.toLocaleString("en-US")}</td>
                  {fi.price && <td className="px-4 py-3 tabular-nums-auto text-slate-600">{e.priceBeforeVat.toLocaleString("en-US")} ريال</td>}
                  {(fi.date || fi.actor) && (
                    <td className="px-4 py-3 tabular-nums-auto text-slate-500">
                      {fi.date && e.invoiceDate}
                      {fi.actor && <Actor uid={e.createdBy} className="block mt-0.5" showIcon={false} />}
                    </td>
                  )}
                  {fi.price && <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{e.totalBeforeVat.toLocaleString("en-US")} ريال</td>}
                  {canDelete && (
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
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="تسجيل وارد جديد">
        <div className="space-y-4">
          <CostItemPicker items={items} onPick={setScannedItem} onScanMiss={handleScanMiss} />
          {scannedItem ? (
            <>
              <div className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <span className="font-bold text-slate-800 text-sm">{scannedItem.name}</span>
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle2 size={13} /> تم التعرّف عليه</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="اسم المورد" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
                  <Input label="تاريخ الفاتورة" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">الوحدة</label>
                    <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-600 flex items-center justify-between">
                      {scannedItem.unit} <span className="text-[10px]">ثابتة لهذا الصنف 🔒</span>
                    </div>
                  </div>
                  <Input label={`الكمية الواردة (${scannedItem.unit})`} type="number" min={0} step="0.01" required
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="السعر قبل الضريبة (للوحدة)" type="number" min={0} step="0.01"
                    value={form.priceBeforeVat} onChange={(e) => setForm({ ...form, priceBeforeVat: e.target.value })} />
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">الإجمالي قبل الضريبة</label>
                    <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-[#EEF1F7] text-[#1C2D50] font-bold tabular-nums-auto">
                      {total.toLocaleString("en-US")} ريال
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
                  <Button type="submit" loading={saving}>حفظ عملية الوارد</Button>
                </div>
              </form>
            </>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">امسح باركود الصنف أو اختره من القائمة للمتابعة</p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف عملية الوارد"
        message={`سيُخصم ${deleteTarget?.quantity} ${deleteTarget?.unit} من رصيد "${deleteTarget?.itemName}". متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
