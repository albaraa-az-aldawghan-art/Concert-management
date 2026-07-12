"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getWarehouseItems, addWarehouseItem, updateWarehouseItem, deleteWarehouseItem } from "@/lib/firestore/warehouse";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { WarehouseItem } from "@/types";
import { uploadImage, thumbUrl } from "@/lib/cloudinary";
import { Plus, Package, Pencil, Trash2, ImagePlus, X } from "lucide-react";

export default function AdminWarehousePage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const canManage = can("warehouse", "manage");
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
    pricePerUnit: "",
  });
  // Image state: existing URL (edit mode) + newly picked file with local preview
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  function pickImage(file: File | null) {
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function resetImage() {
    pickImage(null);
    setImageUrl(null);
  }

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
      pricePerUnit: String(item.pricePerUnit ?? ""),
    });
    pickImage(null);
    setImageUrl(item.imageUrl ?? null);
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
      const pricePerUnit = form.type === "external" && form.pricePerUnit ? parseFloat(form.pricePerUnit) : null;

      // Upload the picked image to Cloudinary first (if any)
      let finalImageUrl = imageUrl;
      if (imageFile) {
        finalImageUrl = await uploadImage(imageFile);
      }

      if (editTarget) {
        await updateWarehouseItem(editTarget.id, {
          name: form.name,
          totalCount: total,
          availableCount: available,
          type: form.type,
          pricePerUnit,
          imageUrl: finalImageUrl,
        });
        showToast("تم تحديث المادة بنجاح");
        setEditTarget(null);
      } else {
        await addWarehouseItem({
          name: form.name,
          totalCount: total,
          availableCount: available,
          type: form.type,
          pricePerUnit,
          imageUrl: finalImageUrl,
        });
        showToast("تم إضافة المادة بنجاح");
        setShowAdd(false);
      }
      setForm({ name: "", totalCount: "", availableCount: "", type: "internal", pricePerUnit: "" });
      resetImage();
      loadItems();
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
      await deleteWarehouseItem(deleteTarget.id);
      showToast("تم حذف المادة");
      setDeleteTarget(null);
      loadItems();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;
  const internalCount = items.filter((i) => i.type === "internal").length;
  const externalCount = items.filter((i) => i.type === "external").length;

  function renderForm(isEdit: boolean) {
    const shownImage = imagePreview ?? imageUrl;
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="اسم المادة"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required placeholder="مثال: كرسي، طاولة..." />

        {/* Image picker */}
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-2">صورة المادة (اختياري)</label>
          {shownImage ? (
            <div className="relative w-28 h-28">
              <img
                src={shownImage}
                alt="صورة المادة"
                className="w-28 h-28 object-cover rounded-xl border border-slate-200"
              />
              <button
                type="button"
                onClick={resetImage}
                className="absolute -top-2 -left-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow"
                aria-label="إزالة الصورة"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 w-28 h-28 border-2 border-dashed border-slate-300 hover:border-[#1C2D50] rounded-xl cursor-pointer text-slate-400 hover:text-[#1C2D50] transition-colors">
              <ImagePlus size={22} />
              <span className="text-xs font-medium">إضافة صورة</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="العدد الإجمالي"
            type="number"
            min={1}
            value={form.totalCount}
            onChange={(e) => setForm({ ...form, totalCount: e.target.value })}
            required />
          <Input
            label="المتوفر حالياً"
            type="number"
            min={0}
            value={form.availableCount}
            onChange={(e) => setForm({ ...form, availableCount: e.target.value })}
            required />
        </div>
        <Select
          label="النوع"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as "internal" | "external", pricePerUnit: "" })}
        >
          <option value="internal">داخلي (من المخزن)</option>
          <option value="external">خارجي (مستأجر)</option>
        </Select>
        {form.type === "external" && (
          <Input
            label="سعر الحبة (ريال)"
            type="number"
            min={0}
            step="0.01"
            value={form.pricePerUnit}
            onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
            placeholder="0.00 ريال (اختياري)"
          />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditTarget(null); }}>
            إلغاء
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "حفظ التعديلات" : "إضافة المادة"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">المخزن</h2>
          <p className="text-sm text-slate-500">
            {internalCount} داخلي · {externalCount} خارجي
          </p>
        </div>
        {canManage && (
          <Button onClick={() => { setForm({ name: "", totalCount: "", availableCount: "", type: "internal", pricePerUnit: "" }); resetImage(); setShowAdd(true); }}>
            <Plus size={16} />
            إضافة مادة
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["", "internal", "external"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterType === t
                ? "bg-[#1C2D50] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t === "" ? "الكل" : t === "internal" ? "داخلي" : "خارجي"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>لا توجد مواد في المخزن</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  {item.imageUrl && (
                    <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img
                        src={thumbUrl(item.imageUrl, 160)}
                        alt={item.name}
                        loading="lazy"
                        className="w-14 h-14 object-cover rounded-xl border border-slate-200"
                      />
                    </a>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{item.name}</h3>
                    <StatusBadge status={item.type} />
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">الإجمالي</span>
                  <span className="font-semibold text-slate-800">{item.totalCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">المتوفر</span>
                  <span className={`font-semibold ${item.availableCount === 0 ? "text-red-600" : "text-green-600"}`}>
                    {item.availableCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">المستخدم</span>
                  <span className="font-semibold text-orange-600">
                    {item.totalCount - item.availableCount}
                  </span>
                </div>
                {item.type === "external" && item.pricePerUnit != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">سعر الحبة</span>
                    <span className="font-semibold text-amber-600">{item.pricePerUnit.toLocaleString("en-US")} ريال</span>
                  </div>
                )}
                {/* Progress bar */}
                <div className="mt-2 bg-slate-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-[#EEF1F7]0 transition-all"
                    style={{ width: `${(item.availableCount / item.totalCount) * 100}%` }}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مادة جديد">
        {renderForm(false)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="تعديل المادة">
        {renderForm(true)}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المادة"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}

