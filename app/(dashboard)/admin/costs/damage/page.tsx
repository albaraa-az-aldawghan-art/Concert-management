"use client";

/* التالف: خسائر المستودع وما تلف بعد الصرف — لا تُحمَّل على أي حفلة. */
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/ui/feature-gate";
import { useAuth } from "@/contexts/AuthContext";
import { getCostDamages, addStoreDamage, deleteCostDamage, getCostItems } from "@/lib/firestore/costs";
import { useToast } from "@/components/ui/toast";
import { Actor } from "@/components/ui/actor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { CostItemPicker } from "@/components/ui/cost-item-picker";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { itemBalance, averageCost } from "@/lib/recipes";
import { CostDamage, CostItem } from "@/types";
import { Plus, Trash2, AlertTriangle, PackageMinus, Store } from "lucide-react";

const PAGE_SIZE = 10;

function CostsDamagePageInner() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canRecord = isAdmin || feat("costs", "out_add");

  const [entries, setEntries] = useState<CostDamage[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [picked, setPicked] = useState<CostItem | null>(null);
  const [form, setForm] = useState({ quantity: "", reason: "", date: "" });
  const [deleteTarget, setDeleteTarget] = useState<CostDamage | null>(null);

  useEffect(() => { setPage(1); }, [search, dateF]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [d, i] = await Promise.all([
      getCostDamages().catch(() => [] as CostDamage[]),
      getCostItems().catch(() => [] as CostItem[]),
    ]);
    setEntries(d);
    setItems(i);
    setLoading(false);
  }

  function openAdd() {
    setPicked(null);
    setForm({ quantity: "", reason: "", date: new Date().toISOString().slice(0, 10) });
    setShowAdd(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !picked) return;
    const quantity = parseFloat(form.quantity);
    if (!quantity || quantity <= 0) { showToast("أدخل كمية صحيحة", "error"); return; }
    if (!form.reason.trim()) { showToast("اكتب سبب التلف", "error"); return; }
    setSaving(true);
    try {
      await addStoreDamage({
        itemBarcode: picked.id,
        quantity,
        reason: form.reason.trim(),
        damageDate: form.date,
        createdBy: appUser.uid,
      });
      showToast("سُجّل التالف وخُصم من الرصيد");
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
      await deleteCostDamage(deleteTarget);
      showToast("تم حذف القيد");
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
    .filter((e) => matchesDate(e.damageDate ?? e.createdAt, dateF))
    .filter((e) => !q || e.itemName.includes(q) || e.itemBarcode.includes(q) || e.reason.includes(q) ||
      (e.clientName ?? "").includes(q) || (e.concertName ?? "").includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalLoss = filtered.reduce((s, e) => s + e.totalCost, 0);
  const storeLoss = filtered.filter((e) => e.source === "store").reduce((s, e) => s + e.totalCost, 0);
  const outLoss = totalLoss - storeLoss;

  const qty = parseFloat(form.quantity) || 0;
  const estimated = picked ? Math.round(qty * averageCost(picked) * 100) / 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">التالف</h2>
          <p className="text-sm text-slate-500">{entries.length} قيد تالف — خسائر لا تُحمَّل على أي حفلة</p>
        </div>
        {canRecord && (
          <Button onClick={openAdd}>
            <Plus size={16} /> تسجيل تالف من المستودع
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-red-50 border-red-100">
          <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> إجمالي التالف</p>
          <p className="text-lg font-bold text-red-700 tabular-nums-auto mt-1">{totalLoss.toLocaleString("en-US")} ريال</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5"><Store size={13} /> تلف في المستودع</p>
          <p className="text-lg font-bold text-slate-700 tabular-nums-auto mt-1">{storeLoss.toLocaleString("en-US")} ريال</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5"><PackageMinus size={13} /> تلف بعد الصرف</p>
          <p className="text-lg font-bold text-slate-700 tabular-nums-auto mt-1">{outLoss.toLocaleString("en-US")} ريال</p>
        </Card>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف أو السبب أو العميل..." />
      <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بتاريخ التلف" matchedCount={filtered.length} unitLabel="قيد" />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <AlertTriangle size={40} className="mb-3 opacity-40" />
          <p>لا توجد قيود تالف مطابقة</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                <th className="px-4 py-3 font-semibold">المصدر</th>
                <th className="px-4 py-3 font-semibold">السبب</th>
                <th className="px-4 py-3 font-semibold">التاريخ</th>
                <th className="px-4 py-3 font-semibold">القيمة</th>
                {isAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800">{e.itemName}</span>
                    <span className="block text-[10px] text-slate-400 font-mono">{e.itemBarcode}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto">{e.quantity.toLocaleString("en-US")} {e.unit}</td>
                  <td className="px-4 py-3">
                    {e.source === "store" ? (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">المستودع</span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        بعد الصرف{e.clientName || e.concertName ? ` · ${e.clientName || e.concertName}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.reason || "—"}</td>
                  <td className="px-4 py-3 tabular-nums-auto text-slate-500">
                    {e.damageDate}
                    <Actor uid={e.createdBy} className="block mt-0.5" showIcon={false} />
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto font-semibold text-red-600">{e.totalCost.toLocaleString("en-US")} ريال</td>
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="تسجيل تالف من المستودع">
        <div className="space-y-4">
          <CostItemPicker
            items={items}
            onPick={setPicked}
            onScanMiss={() => showToast("لم يُعثر على صنف بهذا الباركود", "error")}
            showBalance
          />
          {picked ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <span className="font-bold text-slate-800 text-sm">{picked.name}</span>
                <span className="text-xs text-slate-500 tabular-nums-auto">
                  الرصيد {itemBalance(picked).toLocaleString("en-US")} {picked.unit}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={`الكمية التالفة (${picked.unit})`} type="number" min={0} step="0.001" required
                  value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                <Input label="تاريخ التلف" type="date" required
                  value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <Input label="سبب التلف" required placeholder="مثال: انتهت صلاحيته · كسر · سوء تخزين"
                value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <div className="text-xs text-slate-600 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 tabular-nums-auto">
                القيمة بمتوسط سعر التكلفة:{" "}
                <span className="font-bold text-red-600">{estimated.toLocaleString("en-US")} ريال</span>
                {qty > itemBalance(picked) && (
                  <span className="block text-red-600 font-semibold mt-1">الكمية أكبر من الرصيد المتاح</span>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
                <Button type="submit" loading={saving} disabled={qty > itemBalance(picked)}>حفظ</Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">امسح باركود الصنف أو اختره من القائمة للمتابعة</p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف قيد التالف"
        message={
          deleteTarget?.source === "store"
            ? `سترجع ${deleteTarget?.quantity} ${deleteTarget?.unit} إلى رصيد "${deleteTarget?.itemName}". متابعة؟`
            : `هذه الكمية خرجت مع عملية الصرف فلن تعود للمخزون، وستُعاد قيمتها (${deleteTarget?.totalCost} ريال) إلى تكلفة الحفلة. متابعة؟`
        }
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}

export default function CostsDamagePage() {
  return (
    <FeatureGate feature="damage" name="التالف">
      <CostsDamagePageInner />
    </FeatureGate>
  );
}
