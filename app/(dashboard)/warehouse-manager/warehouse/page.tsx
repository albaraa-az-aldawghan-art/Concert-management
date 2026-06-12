"use client";

import { useEffect, useState } from "react";
import { getWarehouseItems, addWarehouseItem, updateWarehouseItem, deleteWarehouseItem } from "@/lib/firestore/warehouse";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { WarehouseItem } from "@/types";
import { Plus, Package, Pencil, Trash2 } from "lucide-react";

export default function WarehouseManagerWarehousePage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("");

  const [form, setForm] = useState({
    name: "",
    totalCount: "",
    availableCount: "",
    type: "internal" as "internal" | "external",
  });

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const data = await getWarehouseItems();
    setItems(data);
    setLoading(false);
  }

  function openEdit(item: WarehouseItem) {
    setEditTarget(item);
    setForm({
      name: item.name,
      totalCount: String(item.totalCount),
      availableCount: String(item.availableCount),
      type: item.type,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const total = parseInt(form.totalCount);
    const available = parseInt(form.availableCount);
    if (available > total) {
      showToast("الكمية المتوفرة لا تتجاوز الإجمالي", "error");
      setSaving(false);
      return;
    }
    try {
      if (editTarget) {
        await updateWarehouseItem(editTarget.id, { name: form.name, totalCount: total, availableCount: available, type: form.type });
        showToast("تم تحديث المادة بنجاح");
        setEditTarget(null);
      } else {
        await addWarehouseItem({ name: form.name, totalCount: total, availableCount: available, type: form.type });
        showToast("تم إضافة المادة بنجاح");
        setShowAdd(false);
      }
      setForm({ name: "", totalCount: "", availableCount: "", type: "internal" });
      loadItems();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteWarehouseItem(deleteTarget.id);
      showToast("تم حذف المادة");
      setDeleteTarget(null);
      loadItems();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">إدارة المخزن</h2>
          <p className="text-sm text-slate-500">{items.length} غرض</p>
        </div>
        <Button onClick={() => { setForm({ name: "", totalCount: "", availableCount: "", type: "internal" }); setShowAdd(true); }}>
          <Plus size={16} /> إضافة مادة
        </Button>
      </div>

      <div className="flex gap-2">
        {["", "internal", "external"].map((t) => (
          <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === t ? "bg-blue-700 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {t === "" ? "الكل" : t === "internal" ? "داخلي" : "خارجي"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" /><p>لا توجد مواد</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-800">{item.name}</h3>
                  <StatusBadge status={item.type} />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteTarget(item)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "الإجمالي", value: item.totalCount, color: "" },
                  { label: "المتوفر", value: item.availableCount, color: item.availableCount === 0 ? "text-red-600" : "text-green-600" },
                  { label: "المستخدم", value: item.totalCount - item.availableCount, color: "text-orange-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-semibold text-slate-800 ${color}`}>{value}</span>
                  </div>
                ))}
                <div className="bg-slate-100 rounded-full h-1.5 mt-2">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${(item.availableCount / item.totalCount) * 100}%` }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مادة جديد">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="اسم المادة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="مثال: كرسي، طاولة..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="الإجمالي" type="number" min={1} value={form.totalCount} onChange={(e) => setForm({ ...form, totalCount: e.target.value })} required />
            <Input label="المتوفر" type="number" min={0} value={form.availableCount} onChange={(e) => setForm({ ...form, availableCount: e.target.value })} required />
          </div>
          <Select label="النوع" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "internal" | "external" })}>
            <option value="internal">داخلي (من المخزن)</option>
            <option value="external">خارجي (مستأجر)</option>
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditTarget(null); }}>إلغاء</Button>
            <Button type="submit" loading={saving}>إضافة</Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="تعديل المادة">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="اسم المادة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="مثال: كرسي، طاولة..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="الإجمالي" type="number" min={1} value={form.totalCount} onChange={(e) => setForm({ ...form, totalCount: e.target.value })} required />
            <Input label="المتوفر" type="number" min={0} value={form.availableCount} onChange={(e) => setForm({ ...form, availableCount: e.target.value })} required />
          </div>
          <Select label="النوع" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "internal" | "external" })}>
            <option value="internal">داخلي (من المخزن)</option>
            <option value="external">خارجي (مستأجر)</option>
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditTarget(null); }}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ</Button>
          </div>
        </form>
      </Modal>
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="حذف المادة" message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟`} confirmLabel="حذف" loading={saving} />
    </div>
  );
}
