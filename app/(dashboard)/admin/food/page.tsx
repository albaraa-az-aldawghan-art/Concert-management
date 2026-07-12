"use client";

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
import {
  getFoodCategories, addFoodCategory, updateFoodCategory,
  deleteFoodCategory, updateFoodCategoriesOrder,
} from "@/lib/firestore/food";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { FoodCategory } from "@/types";
import { UtensilsCrossed, Plus, Trash2, Pencil, X, GripVertical } from "lucide-react";

/* ── Sortable card ── */
function SortableCategoryCard({
  cat,
  onEdit,
  onDelete,
  canManage,
}: {
  cat: FoodCategory;
  onEdit: (cat: FoodCategory) => void;
  onDelete: (cat: FoodCategory) => void;
  canManage: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id, disabled: !canManage });

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
            {canManage && (
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
            <p className="font-bold text-slate-800 text-base truncate">{cat.name}</p>
          </div>
          {canManage && (
            <div className="flex gap-1 shrink-0 mr-1">
              <button
                onClick={() => onEdit(cat)}
                className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(cat)}
                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        {cat.options.length === 0 ? (
          <p className="text-xs text-slate-400">لا توجد أصناف</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cat.options.map((opt) => (
              <span
                key={opt}
                className="bg-[#EEF1F7] text-[#1C2D50] text-xs px-2.5 py-1 rounded-full font-medium"
              >
                {opt}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Main page ── */
export default function AdminFoodPage() {
  const { appUser, can } = useAuth();
  const { showToast } = useToast();
  const canManage = can("food", "manage");

  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FoodCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FoodCategory | null>(null);

  const [formName, setFormName] = useState("");
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setCategories(await getFoodCategories());
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!canManage) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);

    setCategories(reordered);
    try {
      await updateFoodCategoriesOrder(reordered.map((c) => c.id));
    } catch {
      showToast("حدث خطأ في حفظ الترتيب", "error");
      load();
    }
  }

  function openAdd() {
    setEditTarget(null);
    setFormName("");
    setFormOptions([]);
    setOptionInput("");
    setShowForm(true);
  }

  function openEdit(cat: FoodCategory) {
    setEditTarget(cat);
    setFormName(cat.name);
    setFormOptions([...cat.options]);
    setOptionInput("");
    setShowForm(true);
  }

  function addOption() {
    const v = optionInput.trim();
    if (!v || formOptions.includes(v)) return;
    setFormOptions((prev) => [...prev, v]);
    setOptionInput("");
  }

  async function handleSave() {
    if (!appUser || !formName.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await updateFoodCategory(editTarget.id, { name: formName.trim(), options: formOptions });
        showToast("تم تحديث قسم المأكولات");
      } else {
        await addFoodCategory({ name: formName.trim(), options: formOptions, createdBy: appUser.uid, order: categories.length });
        showToast("تم إضافة قسم المأكولات");
      }
      setShowForm(false);
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteFoodCategory(deleteTarget.id);
      showToast("تم حذف قسم المأكولات");
      setDeleteTarget(null);
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">أصناف الأكل</h2>
          <p className="text-sm text-slate-500">{categories.length} قسم مضاف</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus size={16} /> إضافة قسم مأكولات
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <UtensilsCrossed size={40} className="mb-3 opacity-40" />
          <p>لم تتم إضافة أي أصناف بعد</p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <GripVertical size={13} />
            اسحب الأقسام لإعادة الترتيب — سيُطبَّق على العقود وصفحة إنشاء الحفلة
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={categories.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((cat) => (
                  <SortableCategoryCard
                    key={cat.id}
                    cat={cat}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    canManage={canManage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editTarget ? `تعديل: ${editTarget.name}` : "إضافة قسم مأكولات جديد"}
      >
        <div className="space-y-4">
          <Input
            label="اسم قسم المأكولات"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="مثال: كبسة، مندي، مشاوي..."
          />

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">الأصناف</label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={optionInput}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                placeholder="اكتب صنفاً واضغط Enter أو إضافة..."
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              />
              <Button type="button" variant="outline" onClick={addOption} size="sm">
                <Plus size={14} />
              </Button>
            </div>
            {formOptions.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد أصناف — القسم سيُضاف بدون أصناف</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {formOptions.map((opt) => (
                  <span
                    key={opt}
                    className="flex items-center gap-1 bg-[#EEF1F7] text-[#1C2D50] text-sm px-3 py-1 rounded-full font-medium"
                  >
                    {opt}
                    <button
                      type="button"
                      onClick={() => setFormOptions((prev) => prev.filter((o) => o !== opt))}
                      className="text-blue-400 hover:text-red-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave} loading={saving} disabled={!formName.trim()}>
              {editTarget ? "حفظ التغييرات" : "إضافة قسم المأكولات"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف قسم المأكولات"
        message={`هل أنت متأكد من حذف قسم المأكولات "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
