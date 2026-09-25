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
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/contexts/AuthContext";
import { getWarehouseItems, addWarehouseItem, updateWarehouseItem, deleteWarehouseItem, updateWarehouseItemsOrder, getWarehouseCategories, updateWarehouseCategories } from "@/lib/firestore/warehouse";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { WarehouseItem } from "@/types";
import { uploadImage, thumbUrl } from "@/lib/cloudinary";
import { auth } from "@/lib/firebase";
import { Plus, Package, Pencil, Trash2, ImagePlus, X, GripVertical, Search, FileSpreadsheet, FolderPlus } from "lucide-react";

/* ── صف قابل للسحب داخل الجدول — نفس منطق الترتيب السابق على البطاقات ── */
function SortableItemRow({
  item,
  canEdit,
  canDelete,
  canReorder,
  showPrice,
  showAvailable,
  categories,
  onCategoryChange,
  onEdit,
  onDelete,
}: {
  item: WarehouseItem;
  canEdit: boolean;
  canDelete: boolean;
  canReorder: boolean;
  showPrice: boolean;
  showAvailable: boolean;
  categories: string[];
  onCategoryChange: (item: WarehouseItem, category: string) => void;
  onEdit: (item: WarehouseItem) => void;
  onDelete: (item: WarehouseItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canReorder });

  const used = item.totalCount - item.availableCount;
  const ratio = item.totalCount > 0 ? item.availableCount / item.totalCount : 0;

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
      className="border-b border-slate-100 last:border-0 bg-white"
    >
      <td className="px-3 py-2 w-8">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
            style={{ touchAction: "none" }}
            aria-label="سحب لإعادة الترتيب"
          >
            <GripVertical size={16} />
          </button>
        )}
      </td>
      <td className="px-3 py-2 w-14">
        {item.imageUrl ? (
          <a href={item.imageUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={thumbUrl(item.imageUrl, 120)}
              alt={item.name}
              loading="lazy"
              className="w-9 h-9 object-cover rounded-lg border border-slate-200"
            />
          </a>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
            <Package size={14} className="text-slate-300" />
          </div>
        )}
      </td>
      <td className="px-3 py-2 font-semibold text-slate-800 text-sm min-w-[10rem]">{item.name}</td>
      <td className="px-3 py-2 text-sm text-slate-500 min-w-[10rem]">
        {canEdit ? <select value={item.category ?? ""} onChange={(e) => onCategoryChange(item, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1C2D50]">
          <option value="">غير مصنّف</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select> : item.category || "غير مصنّف"}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
            item.type === "internal" ? "bg-[#EEF1F7] text-[#1C2D50]" : "bg-amber-50 text-amber-700"
          }`}
        >
          {item.type === "internal" ? "داخلي" : "خارجي"}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-slate-700 tabular-nums-auto text-center">{item.totalCount}</td>
      {showAvailable && (
        <>
          <td className="px-3 py-2 text-sm tabular-nums-auto text-center">
            <span className={item.availableCount === 0 ? "text-red-600 font-semibold" : "text-emerald-700"}>
              {item.availableCount}
            </span>
          </td>
          <td className="px-3 py-2 text-sm text-orange-600 tabular-nums-auto text-center">{used}</td>
        </>
      )}
      {showPrice && (
        <td className="px-3 py-2 text-sm text-amber-700 tabular-nums-auto text-center whitespace-nowrap">
          {item.pricePerUnit != null ? `${item.pricePerUnit.toLocaleString("en-US")} ر.س` : "—"}
        </td>
      )}
      {showAvailable && (
        <td className="px-3 py-2 w-28">
          <div className="bg-slate-100 rounded-full h-1.5 min-w-[4rem]">
            <div
              className={`h-1.5 rounded-full transition-all ${
                ratio > 0.5 ? "bg-emerald-500" : ratio > 0.2 ? "bg-orange-400" : "bg-red-400"
              }`}
              style={{ width: `${Math.max(ratio * 100, 2)}%` }}
            />
          </div>
        </td>
      )}
      <td className="px-3 py-2 w-16">
        {(canEdit || canDelete) && (
          <div className="flex gap-1 justify-end">
            {canEdit && (
              <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors">
                <Pencil size={14} />
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(item)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
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
  const canExport = feat("warehouse", "export");
  /* السعر يقيّم المفقودات — ليس كل من يرى المواد يرى قيمتها */
  const fw = {
    price:     feat("warehouse", "wf_price"),
    available: feat("warehouse", "wf_available"),
  };
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [showCategories, setShowCategories] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [pendingCategoryChange, setPendingCategoryChange] = useState<{ item: WarehouseItem; category: string } | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    name: "", category: "", type: "", totalMin: "", totalMax: "",
    availableMin: "", availableMax: "", usedMin: "", usedMax: "", priceMin: "", priceMax: "",
  });

  const [form, setForm] = useState({
    name: "",
    totalCount: "",
    availableCount: "",
    type: "internal" as "internal" | "external",
    category: "",
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
    setLoadError(false);
    try {
      const [data, savedCategories] = await Promise.all([getWarehouseItems(), getWarehouseCategories()]);
      setItems(data);
      setCategories(savedCategories);
    } catch (err) {
      setLoadError(true);
      showToast(err instanceof Error ? err.message : "تعذّر تحميل الموارد", "error");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(item: WarehouseItem) {
    setEditTarget(item);
    setForm({
      name: item.name,
      totalCount: String(item.totalCount),
      availableCount: String(item.availableCount),
      type: item.type,
      category: item.category ?? "",
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
          category: form.category || null,
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
          category: form.category || null,
          pricePerUnit,
          imageUrl: finalImageUrl,
        });
        showToast("تم إضافة المادة بنجاح");
        setShowAdd(false);
      }
      setForm({ name: "", totalCount: "", availableCount: "", type: "internal", category: "", pricePerUnit: "" });
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

  async function handleExport() {
    setExporting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const res = await fetch("/api/export/warehouse", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذّر التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "الموارد.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("نُزّل الملف");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر التصدير", "error");
    } finally {
      setExporting(false);
    }
  }

  const q = search.trim().toLowerCase();
  const numberInRange = (value: number, min: string, max: string) =>
    (!min || value >= Number(min)) && (!max || value <= Number(max));
  const filtered = items.filter((i) => {
    const used = i.totalCount - i.availableCount;
    if (q && !i.name.toLowerCase().includes(q) && !(i.category ?? "").toLowerCase().includes(q)) return false;
    if (filters.name && !i.name.toLowerCase().includes(filters.name.trim().toLowerCase())) return false;
    if (filters.category === "__none" && i.category) return false;
    if (filters.category && filters.category !== "__none" && i.category !== filters.category) return false;
    if (filters.type && i.type !== filters.type) return false;
    if (!numberInRange(i.totalCount, filters.totalMin, filters.totalMax)) return false;
    if (!numberInRange(i.availableCount, filters.availableMin, filters.availableMax)) return false;
    if (!numberInRange(used, filters.usedMin, filters.usedMax)) return false;
    if (!numberInRange(i.pricePerUnit ?? 0, filters.priceMin, filters.priceMax)) return false;
    return true;
  });
  // Dragging is only meaningful on the unfiltered global list
  const hasColumnFilters = Object.values(filters).some(Boolean);
  const canReorder = canReorderPerm && q === "" && !hasColumnFilters;

  async function addCategory() {
    const name = categoryInput.trim();
    if (!name || categories.includes(name)) return;
    const next = [...categories, name];
    setSaving(true);
    try { await updateWarehouseCategories(next); setCategories(next); setCategoryInput(""); showToast("تمت إضافة قسم الموارد"); }
    catch (err) { showToast(err instanceof Error ? err.message : "تعذّرت إضافة القسم", "error"); }
    finally { setSaving(false); }
  }

  async function confirmCategoryChange() {
    if (!pendingCategoryChange) return;
    setSaving(true);
    try {
      await updateWarehouseItem(pendingCategoryChange.item.id, { category: pendingCategoryChange.category || null });
      setItems((current) => current.map((item) => item.id === pendingCategoryChange.item.id ? { ...item, category: pendingCategoryChange.category || null } : item));
      showToast("تم تحديث قسم المادة");
      setPendingCategoryChange(null);
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تحديث القسم", "error"); }
    finally { setSaving(false); }
  }

  async function renameCategory(oldName: string) {
    const newName = (categoryNames[oldName] ?? oldName).trim();
    if (!newName || newName === oldName) return;
    if (categories.includes(newName)) { showToast("اسم القسم موجود مسبقاً", "error"); return; }
    setSaving(true);
    try {
      await Promise.all(items.filter((item) => item.category === oldName).map((item) => updateWarehouseItem(item.id, { category: newName })));
      const next = categories.map((category) => category === oldName ? newName : category);
      await updateWarehouseCategories(next);
      setCategories(next);
      setItems((current) => current.map((item) => item.category === oldName ? { ...item, category: newName } : item));
      setCategoryNames((current) => { const nextNames = { ...current }; delete nextNames[oldName]; return nextNames; });
      showToast("تم تعديل اسم القسم");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تعديل القسم", "error"); }
    finally { setSaving(false); }
  }

  async function deleteCategory() {
    if (!categoryDeleteTarget) return;
    setSaving(true);
    try {
      await Promise.all(items.filter((item) => item.category === categoryDeleteTarget).map((item) => updateWarehouseItem(item.id, { category: null })));
      const next = categories.filter((category) => category !== categoryDeleteTarget);
      await updateWarehouseCategories(next);
      setCategories(next);
      setItems((current) => current.map((item) => item.category === categoryDeleteTarget ? { ...item, category: null } : item));
      setCategoryDeleteTarget(null);
      showToast("تم حذف القسم ونقل مواده إلى غير مصنّف");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حذف القسم", "error"); }
    finally { setSaving(false); }
  }

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
          label="القسم"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          required
        >
          <option value="" disabled>اختر قسم المادة</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
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
            {items.length} مادة في {categories.length} قسم
          </p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <Button variant="secondary" loading={exporting} onClick={handleExport}>
              <FileSpreadsheet size={16} />
              تصدير إكسل
            </Button>
          )}
          {(canAdd || canEdit) && (
            <Button variant="outline" onClick={() => setShowCategories(true)}><FolderPlus size={16} /> إدارة الأقسام</Button>
          )}
          {canAdd && (
            <Button onClick={() => { setForm({ name: "", totalCount: "", availableCount: "", type: "internal", category: "", pricePerUnit: "" }); resetImage(); setShowAdd(true); }}>
              <Plus size={16} />
              إضافة مادة
            </Button>
          )}
        </div>
      </div>

      {/* البحث فقط: الداخلي والخارجي يظهران معاً بلا تبويب أو فلتر */}
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
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-slate-500">
          <Package size={40} className="text-red-300" />
          <p>تعذّر تحميل الموارد</p>
          <Button type="button" variant="outline" onClick={loadItems}>إعادة المحاولة</Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>لا توجد مواد في الموارد</p>
        </Card>
      ) : (
        <>
          {canReorder && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <GripVertical size={13} />
              اسحب المواد لإعادة الترتيب — الترتيب يظهر في كل القوائم
            </p>
          )}
          <Card className="p-0 overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <table className="data-table w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2.5 w-8"></th>
                      <th className="px-3 py-2.5 w-14"></th>
                      <th className="px-3 py-2.5 font-semibold">الاسم</th>
                      <th className="px-3 py-2.5 font-semibold">القسم</th>
                      <th className="px-3 py-2.5 font-semibold">النوع</th>
                      <th className="px-3 py-2.5 font-semibold text-center">الإجمالي</th>
                      {fw.available && (
                        <>
                          <th className="px-3 py-2.5 font-semibold text-center">المتوفر</th>
                          <th className="px-3 py-2.5 font-semibold text-center">المستخدم</th>
                        </>
                      )}
                      {fw.price && <th className="px-3 py-2.5 font-semibold text-center">سعر الحبة</th>}
                      {fw.available && <th className="px-3 py-2.5 font-semibold">التوفر</th>}
                      <th className="px-3 py-2.5"></th>
                    </tr>
                    <tr className="border-b border-slate-200 bg-white align-top">
                      <th></th><th></th>
                      <th className="px-2 py-2"><input value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} placeholder="بحث بالاسم..." className="w-full min-w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></th>
                      <th className="px-2 py-2"><select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="w-full min-w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">كل الأقسام</option><option value="__none">غير مصنّف</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></th>
                      <th className="px-2 py-2"><select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="w-full min-w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">كل الأنواع</option><option value="internal">داخلي</option><option value="external">خارجي</option></select></th>
                      <th className="px-2 py-2"><div className="flex gap-1"><input type="number" min={0} value={filters.totalMin} onChange={(e) => setFilters({ ...filters, totalMin: e.target.value })} placeholder="من" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /><input type="number" min={0} value={filters.totalMax} onChange={(e) => setFilters({ ...filters, totalMax: e.target.value })} placeholder="إلى" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></div></th>
                      {fw.available && <>
                        <th className="px-2 py-2"><div className="flex gap-1"><input type="number" min={0} value={filters.availableMin} onChange={(e) => setFilters({ ...filters, availableMin: e.target.value })} placeholder="من" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /><input type="number" min={0} value={filters.availableMax} onChange={(e) => setFilters({ ...filters, availableMax: e.target.value })} placeholder="إلى" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></div></th>
                        <th className="px-2 py-2"><div className="flex gap-1"><input type="number" min={0} value={filters.usedMin} onChange={(e) => setFilters({ ...filters, usedMin: e.target.value })} placeholder="من" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /><input type="number" min={0} value={filters.usedMax} onChange={(e) => setFilters({ ...filters, usedMax: e.target.value })} placeholder="إلى" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></div></th>
                      </>}
                      {fw.price && <th className="px-2 py-2"><div className="flex gap-1"><input type="number" min={0} value={filters.priceMin} onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })} placeholder="من" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /><input type="number" min={0} value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} placeholder="إلى" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></div></th>}
                      {fw.available && <th></th>}
                      <th className="px-2 py-2"><button type="button" onClick={() => { setSearch(""); setFilters({ name: "", category: "", type: "", totalMin: "", totalMax: "", availableMin: "", availableMax: "", usedMin: "", usedMax: "", priceMin: "", priceMax: "" }); }} className="text-xs font-semibold text-slate-500 hover:text-red-600 whitespace-nowrap">مسح الفلاتر</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <SortableItemRow
                        key={item.id}
                        item={item}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canReorder={canReorder}
                        showPrice={fw.price}
                        showAvailable={fw.available}
                        categories={categories}
                        onCategoryChange={(target, category) => setPendingCategoryChange({ item: target, category })}
                        onEdit={openEdit}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={6 + (fw.available ? 3 : 0) + (fw.price ? 1 : 0)} className="py-10 text-center text-sm text-slate-400">لا توجد نتائج مطابقة للفلاتر</td></tr>}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </Card>
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

      <Modal open={showCategories} onClose={() => setShowCategories(false)} title="أقسام الموارد">
        <div className="space-y-4">
          <div className="flex gap-2"><Input value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)} placeholder="اسم قسم جديد..." /><Button type="button" onClick={addCategory} loading={saving}><Plus size={15} /> إضافة</Button></div>
          <div className="space-y-2">{categories.length ? categories.map((category) => <div key={category} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <input value={categoryNames[category] ?? category} onChange={(e) => setCategoryNames({ ...categoryNames, [category]: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            <Button type="button" size="sm" variant="outline" onClick={() => renameCategory(category)} disabled={saving || (categoryNames[category] ?? category).trim() === category}>حفظ</Button>
            <button type="button" onClick={() => setCategoryDeleteTarget(category)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
          </div>) : <p className="text-sm text-slate-400">لا توجد أقسام بعد</p>}</div>
        </div>
      </Modal>

      <ConfirmModal open={!!pendingCategoryChange} onClose={() => setPendingCategoryChange(null)} onConfirm={confirmCategoryChange} title="تغيير قسم المادة" message={`هل تريد نقل «${pendingCategoryChange?.item.name ?? ""}» إلى قسم «${pendingCategoryChange?.category || "غير مصنّف"}»؟`} confirmLabel="نعم، تغيير القسم" loading={saving} />

      <ConfirmModal open={!!categoryDeleteTarget} onClose={() => setCategoryDeleteTarget(null)} onConfirm={deleteCategory} title="حذف قسم الموارد" message={`سيتم حذف قسم «${categoryDeleteTarget ?? ""}» ونقل المواد التابعة له إلى «غير مصنّف». هل تريد المتابعة؟`} confirmLabel="حذف القسم" loading={saving} />

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

