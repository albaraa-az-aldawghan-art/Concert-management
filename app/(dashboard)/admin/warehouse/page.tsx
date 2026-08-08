"use client";

/* الموارد: المواد الداخلية والخارجية بأعدادها وأسعارها وصورها وترتيبها. */
import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/contexts/AuthContext";
import { getWarehouseItems, addWarehouseItem, updateWarehouseItem, deleteWarehouseItem, updateWarehouseItemsOrder } from "@/lib/firestore/warehouse";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { WarehouseItem } from "@/types";
import { uploadImage, thumbUrl } from "@/lib/cloudinary";
import { Plus, Package, Pencil, Trash2, ImagePlus, X, GripVertical, Search } from "lucide-react";

/* ── Sortable item card — mirrors the food categories card design ── */
function SortableItemCard({
  item,
  canEdit,
  canDelete,
  canReorder,
  onEdit,
  onDelete,
}: {
  item: WarehouseItem;
  canEdit: boolean;
  canDelete: boolean;
  canReorder: boolean;
  onEdit: (item: WarehouseItem) => void;
  onDelete: (item: WarehouseItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canReorder });

  const used = item.totalCount - item.availableCount;
  const ratio = item.totalCount > 0 ? item.availableCount / item.totalCount : 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <Card>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Drag handle */}
            {canReorder && (
              <button
                {...attributes}
                {...listeners}
                className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
                style={{ touchAction: "none" }}
                aria-label="سحب لإعادة الترتيب"
              >
                <GripVertical size={18} />
              </button>
            )}
            {/* Image / placeholder */}
            {item.imageUrl ? (
              <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img
                  src={thumbUrl(item.imageUrl, 160)}
                  alt={item.name}
                  loading="lazy"
                  className="w-12 h-12 object-cover rounded-xl border border-slate-200"
                />
              </a>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Package size={18} className="text-slate-300" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-base truncate">{item.name}</p>
              <span
                className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold mt-0.5 ${
                  item.type === "internal"
                    ? "bg-[#EEF1F7] text-[#1C2D50]"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.type === "internal" ? "داخلي" : "خارجي"}
              </span>
            </div>
          </div>
          {(canEdit || canDelete) && (
            <div className="flex gap-1 shrink-0 mr-1">
              {canEdit && (
                <button
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats as pill chips — same language as the food options pills */}
        <div className="flex flex-wrap gap-1.5">
          <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
            الإجمالي {item.totalCount}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto ${
            item.availableCount === 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
          }`}>
            المتوفر {item.availableCount}
          </span>
          <span className="bg-orange-50 text-orange-600 text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
            المستخدم {used}
          </span>
          {item.pricePerUnit != null && (
            <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
              {item.pricePerUnit.toLocaleString("en-US")} ريال/حبة
            </span>
          )}
        </div>

        {/* Availability bar */}
        <div className="mt-3 bg-slate-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              ratio > 0.5 ? "bg-emerald-500" : ratio > 0.2 ? "bg-orange-400" : "bg-red-400"
            }`}
            style={{ width: `${Math.max(ratio * 100, 2)}%` }}
          />
        </div>
      </Card>
    </div>
  );
}

export default function AdminWarehousePage() {
  const { showToast } = useToast();
  const { can, feat } = useAuth();
  const canView = can("warehouse");
  const canAdd = feat("warehouse", "add");
  const canEdit = feat("warehouse", "edit");
  const canDelete = feat("warehouse", "delete");
  const canReorderPerm = feat("warehouse", "reorder");
  /* السعر يقيّم المفقودات — ليس كل من يرى المواد يرى قيمتها */
  const fw = {
    price:     feat("warehouse", "wf_price"),
    available: feat("warehouse", "wf_available"),
  };
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    setItems(reordered);
    try {
      await updateWarehouseItemsOrder(reordered.map((i) => i.id));
    } catch {
      showToast("حدث خطأ في حفظ الترتيب", "error");
      loadItems();
    }
  }

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
      // السعر يُحفظ للنوعين: الخارجي تكلفة فعلية، والداخلي لتقييم المفقودات
      const pricePerUnit = form.pricePerUnit ? parseFloat(form.pricePerUnit) : null;

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

  const q = search.trim();
  const filtered = items.filter(
    (i) => (!filterType || i.type === filterType) && (!q || i.name.includes(q))
  );
  const internalCount = items.filter((i) => i.type === "internal").length;
  const externalCount = items.filter((i) => i.type === "external").length;
  // Dragging is only meaningful on the unfiltered global list
  const canReorder = canReorderPerm && filterType === "" && q === "";

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
          onChange={(e) => setForm({ ...form, type: e.target.value as "internal" | "external" })}
        >
          <option value="internal">داخلي (من الموارد)</option>
          <option value="external">خارجي (مستأجر)</option>
        </Select>
        <Input
          label="سعر الحبة (ريال)"
          type="number"
          min={0}
          step="0.01"
          value={form.pricePerUnit}
          onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
          placeholder="0.00 ريال (اختياري)"
          helperText={
            form.type === "external"
              ? "تكلفة فعلية تُحتسب على الحفلة"
              : "للعرض وتقييم المفقودات فقط — لا تُحتسب على الحفلة لأن المادة مملوكة وترجع"
          }
        />

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
          <h2 className="text-xl font-bold text-slate-800">الموارد</h2>
          <p className="text-sm text-slate-500">
            {internalCount} داخلي · {externalCount} خارجي
          </p>
        </div>
        {canAdd && (
          <Button onClick={() => { setForm({ name: "", totalCount: "", availableCount: "", type: "internal", pricePerUnit: "" }); resetImage(); setShowAdd(true); }}>
            <Plus size={16} />
            إضافة مادة
          </Button>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المادة..."
            className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
          />
        </div>
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
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>{q ? "لا توجد نتائج مطابقة للبحث" : "لا توجد مواد في الموارد"}</p>
        </Card>
      ) : (
        <>
          {canReorder && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <GripVertical size={13} />
              اسحب المواد لإعادة الترتيب — الترتيب يظهر في كل القوائم
            </p>
          )}
          {filterType !== "" && canEdit && (
            <p className="text-xs text-slate-400">اختر «الكل» لتتمكن من إعادة الترتيب بالسحب</p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((item) => (
                  <SortableItemCard
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canReorder={canReorder}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
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

