"use client";

/* الوارد: تسجيل المشتريات بأسعارها قبل الضريبة — منه يُبنى متوسط سعر التكلفة. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostIncoming, addCostIncomingInvoice, deleteCostIncoming, getCostItems } from "@/lib/firestore/costs";
import { useToast } from "@/components/ui/toast";
import { Actor } from "@/components/ui/actor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { CostItemPicker } from "@/components/ui/cost-item-picker";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { CostIncoming, CostItem } from "@/types";
import { Plus, PackagePlus, Trash2 } from "lucide-react";

const PAGE_SIZE = 10;
type InvoiceLine = { item: CostItem; quantity: string; priceBeforeVat: string };

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
  const [deleteTarget, setDeleteTarget] = useState<CostIncoming | null>(null);
  const [form, setForm] = useState({ supplierName: "", invoiceNumber: "", invoiceDate: "" });
  const [lines, setLines] = useState<InvoiceLine[]>([]);

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
    setForm({ supplierName: "", invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10) });
    setLines([]);
    setShowAdd(true);
  }

  function addInvoiceItem(item: CostItem) {
    if (lines.some((line) => line.item.id === item.id)) {
      showToast("المادة مضافة إلى الفاتورة مسبقًا", "error");
      return;
    }
    setLines((current) => [...current, { item, quantity: "", priceBeforeVat: "" }]);
  }

  function updateLine(index: number, field: "quantity" | "priceBeforeVat", value: string) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }

  function handleScanMiss() {
    showToast("لم يُعثر على صنف بهذا الباركود — سجّله أولاً من صفحة أصناف التكاليف", "error");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    if (!form.supplierName.trim()) { showToast("أدخل اسم المورد", "error"); return; }
    if (lines.length === 0) { showToast("أضف مادة واحدة على الأقل", "error"); return; }
    if (lines.some((line) => !(Number(line.quantity) > 0) || Number(line.priceBeforeVat) < 0)) {
      showToast("تحقق من الكمية والسعر لكل مادة", "error"); return;
    }
    setSaving(true);
    try {
      await addCostIncomingInvoice({
        supplierName: form.supplierName.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        lines: lines.map((line) => ({
          itemBarcode: line.item.id,
          quantity: Number(line.quantity),
          priceBeforeVat: Number(line.priceBeforeVat) || 0,
        })),
      });
      showToast("تم حفظ فاتورة الشراء وتحديث أرصدة المواد");
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
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.priceBeforeVat) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">فواتير الشراء والوارد</h2>
          <p className="text-sm text-slate-500">{new Set(entries.map((entry) => entry.invoiceId ?? entry.id)).size} فاتورة مسجّلة</p>
        </div>
        {canRecord && (
          <Button onClick={openAdd}>
            <Plus size={16} /> فاتورة شراء جديدة
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
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">رقم الفاتورة</th>
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
                  <td className="px-4 py-3 text-slate-600">{e.invoiceNumber || "—"}</td>
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
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="فاتورة شراء جديدة" size="lg">
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="اسم المورد" required value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
              <Input label="رقم الفاتورة" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              <Input label="تاريخ الفاتورة" type="date" required value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-bold text-slate-700">إضافة مواد الفاتورة</p>
              <CostItemPicker items={items.filter((item) => !lines.some((line) => line.item.id === item.id))} onPick={addInvoiceItem} onScanMiss={handleScanMiss} />
            </div>
            {lines.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">لم تُضف مواد إلى الفاتورة بعد</p> : (
              <div className="data-table-shell"><table className="data-table"><thead><tr><th>المادة</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة قبل الضريبة</th><th>الإجمالي</th><th></th></tr></thead><tbody>
                {lines.map((line, index) => <tr key={line.item.id}>
                  <td><p className="font-semibold text-slate-800">{line.item.name}</p><p className="text-[10px] text-slate-400 font-mono">{line.item.id}</p></td>
                  <td>{line.item.unit}</td>
                  <td><Input aria-label={`كمية ${line.item.name}`} type="number" min={0} step="0.01" required value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></td>
                  <td><Input aria-label={`سعر ${line.item.name}`} type="number" min={0} step="0.01" required value={line.priceBeforeVat} onChange={(e) => updateLine(index, "priceBeforeVat", e.target.value)} /></td>
                  <td className="font-semibold tabular-nums-auto">{((Number(line.quantity) || 0) * (Number(line.priceBeforeVat) || 0)).toLocaleString("en-US")} ريال</td>
                  <td><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-500"><Trash2 size={15} /></button></td>
                </tr>)}
              </tbody></table></div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-[#EEF1F7] px-4 py-3"><span className="font-semibold text-slate-600">إجمالي الفاتورة قبل الضريبة</span><strong className="text-[#1C2D50] tabular-nums-auto">{total.toLocaleString("en-US")} ريال</strong></div>
            <div className="flex gap-3 justify-end pt-2"><Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ فاتورة الشراء</Button></div>
          </form>
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
