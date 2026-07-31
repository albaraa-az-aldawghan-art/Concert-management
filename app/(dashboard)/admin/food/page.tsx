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
import { FoodCategory, FoodOptionDef, RecipeLine, CostItem } from "@/types";
import { optionDefsOf, optionsFromDefs, newOptionId } from "@/lib/recipes";
import { getCostItems } from "@/lib/firestore/costs";
import { UtensilsCrossed, Plus, Trash2, Pencil, X, GripVertical, Search } from "lucide-react";

/* ── Sortable card ── */
function SortableCategoryCard({
  cat,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  canReorder,
}: {
  cat: FoodCategory;
  onEdit: (cat: FoodCategory) => void;
  onDelete: (cat: FoodCategory) => void;
  canEdit: boolean;
  canDelete: boolean;
  canReorder: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id, disabled: !canReorder });

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
            <p className="font-bold text-slate-800 text-base truncate">{cat.name}</p>
          </div>
          {(canEdit || canDelete) && (
            <div className="flex gap-1 shrink-0 mr-1">
              {canEdit && (
                <button
                  onClick={() => onEdit(cat)}
                  className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(cat)}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
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
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canAdd = feat("food", "add");
  const canEdit = feat("food", "edit");
  const canDelete = feat("food", "delete");
  const canReorder = feat("food", "reorder");

  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FoodCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FoodCategory | null>(null);

  const [formName, setFormName] = useState("");
  const [formOptions, setFormOptions] = useState<FoodOptionDef[]>([]);
  const [optionInput, setOptionInput] = useState("");
  const [renameTarget, setRenameTarget] = useState<FoodOptionDef | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /* محرر الوصفة */
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [recipeTarget, setRecipeTarget] = useState<FoodOptionDef | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [recipeSearch, setRecipeSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [cats, items] = await Promise.all([getFoodCategories(), getCostItems().catch(() => [] as CostItem[])]);
      setCategories(cats);
      setCostItems(items);
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled) return;
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
    setFormOptions(optionDefsOf(cat).filter((d) => d.id !== "" || cat.options.length > 0));
    setOptionInput("");
    setShowForm(true);
  }

  function addOption() {
    const v = optionInput.trim();
    if (!v || formOptions.some((o) => o.name === v)) return;
    setFormOptions((prev) => [...prev, { id: newOptionId(), name: v }]);
    setOptionInput("");
  }

  /* إعادة التسمية تحفظ الوصفة لأن الربط بالمعرّف لا بالاسم */
  function applyRename() {
    const v = renameValue.trim();
    if (!renameTarget || !v) return;
    if (formOptions.some((o) => o.name === v && o.id !== renameTarget.id)) {
      showToast("الاسم مستخدم في هذا القسم", "error");
      return;
    }
    setFormOptions((prev) => prev.map((o) => (o.id === renameTarget.id ? { ...o, name: v } : o)));
    setRenameTarget(null);
  }

  function openRecipe(def: FoodOptionDef) {
    setRecipeTarget(def);
    setRecipeLines(def.recipe ? [...def.recipe] : []);
    setRecipeSearch("");
  }

  function addRecipeLine(item: CostItem) {
    if (recipeLines.some((l) => l.barcode === item.id)) return;
    setRecipeLines((prev) => [...prev, { barcode: item.id, itemName: item.name, unit: item.unit, qty: 1, perQty: 1 }]);
    setRecipeSearch("");
  }

  function applyRecipe() {
    if (!recipeTarget) return;
    const clean = recipeLines.filter((l) => l.qty > 0 && l.perQty > 0);
    setFormOptions((prev) =>
      prev.map((o) => (o.id === recipeTarget.id ? { ...o, recipe: clean.length ? clean : undefined } : o))
    );
    setRecipeTarget(null);
  }

  async function handleSave() {
    if (!appUser || !formName.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await updateFoodCategory(editTarget.id, { name: formName.trim(), options: optionsFromDefs(formOptions), optionDefs: formOptions });
        showToast("تم تحديث قسم المأكولات");
      } else {
        await addFoodCategory({ name: formName.trim(), options: optionsFromDefs(formOptions), optionDefs: formOptions, createdBy: appUser.uid, order: categories.length });
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

  // Match by category name OR any option inside it
  const q = search.trim();
  const displayed = q
    ? categories.filter((c) => c.name.includes(q) || c.options.some((o) => o.includes(q)))
    : categories;
  // Dragging a filtered subset would corrupt the global order
  const reorderEnabled = canReorder && q === "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">أصناف الأكل</h2>
          <p className="text-sm text-slate-500">{categories.length} قسم مضاف</p>
        </div>
        {canAdd && (
          <Button onClick={openAdd}>
            <Plus size={16} /> إضافة قسم مأكولات
          </Button>
        )}
      </div>

      {/* Search — matches the category name OR any of its options */}
      <div className="relative sm:max-w-xs">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم القسم أو الصنف..."
          className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C2D50] bg-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <UtensilsCrossed size={40} className="mb-3 opacity-40" />
          <p>{search.trim() ? "لا توجد نتائج مطابقة للبحث" : "لم تتم إضافة أي أصناف بعد"}</p>
        </Card>
      ) : (
        <>
          {reorderEnabled && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <GripVertical size={13} />
              اسحب الأقسام لإعادة الترتيب — سيُطبَّق على العقود وصفحة إنشاء الحفلة
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayed.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayed.map((cat) => (
                  <SortableCategoryCard
                    key={cat.id}
                    cat={cat}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canReorder={reorderEnabled}
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
              <div className="space-y-1.5">
                {formOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className="flex items-center gap-2 bg-[#EEF1F7] text-[#1C2D50] text-sm px-3 py-2 rounded-xl"
                  >
                    <span className="font-medium flex-1 min-w-0 truncate">{opt.name}</span>
                    {opt.recipe?.length ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                        وصفة: {opt.recipe.length} خام
                      </span>
                    ) : null}
                    <button type="button" title="الوصفة" onClick={() => openRecipe(opt)}
                      className="text-[#1C2D50] hover:text-emerald-600 transition-colors shrink-0">
                      <UtensilsCrossed size={13} />
                    </button>
                    <button type="button" title="تعديل الاسم"
                      onClick={() => { setRenameTarget(opt); setRenameValue(opt.name); }}
                      className="text-[#1C2D50] hover:text-blue-600 transition-colors shrink-0">
                      <Pencil size={12} />
                    </button>
                    <button type="button" title="حذف"
                      onClick={() => setFormOptions((prev) => prev.filter((o) => o.id !== opt.id))}
                      className="text-blue-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
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

      {/* تعديل اسم الصنف — الوصفة تنجو لأن الربط بالمعرّف */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="تعديل اسم الصنف" size="sm">
        <div className="space-y-4">
          <Input label="الاسم الجديد" value={renameValue} autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyRename(); } }} />
          <p className="text-xs text-slate-500">الوصفة المرتبطة بهذا الصنف ستبقى كما هي.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setRenameTarget(null)}>إلغاء</Button>
            <Button onClick={applyRename} disabled={!renameValue.trim()}>تعديل</Button>
          </div>
        </div>
      </Modal>

      {/* محرر الوصفة */}
      <Modal open={!!recipeTarget} onClose={() => setRecipeTarget(null)}
        title={recipeTarget ? `وصفة: ${recipeTarget.name}` : ""} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            حدّد كم يستهلك هذا الصنف من كل خام. تستطيع كتابتها كنسبة —
            «5 كجم لكل 10 أطباق» — بدل حساب الكسر يدوياً.
          </p>

          {recipeLines.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد خامات في الوصفة بعد</p>
          ) : (
            <div className="space-y-2">
              {recipeLines.map((line, idx) => (
                <div key={line.barcode} className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{line.itemName}</span>
                  <input type="number" min={0} step="0.001" value={line.qty}
                    onChange={(e) => setRecipeLines((prev) => prev.map((l, i) => i === idx ? { ...l, qty: parseFloat(e.target.value) || 0 } : l))}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                  <span className="text-xs text-slate-500 shrink-0">{line.unit} لكل</span>
                  <input type="number" min={1} step="1" value={line.perQty}
                    onChange={(e) => setRecipeLines((prev) => prev.map((l, i) => i === idx ? { ...l, perQty: parseInt(e.target.value) || 1 } : l))}
                    className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                  <button type="button" onClick={() => setRecipeLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">إضافة خام</label>
            <input type="text" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="ابحث باسم صنف التكاليف..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            {recipeSearch.trim() && (
              <div className="mt-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                {costItems.filter((i) => i.name.includes(recipeSearch.trim()) && !recipeLines.some((l) => l.barcode === i.id)).slice(0, 20).map((i) => (
                  <button key={i.id} type="button" onClick={() => addRecipeLine(i)}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                    <span className="truncate">{i.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{i.unit}</span>
                  </button>
                ))}
                {costItems.filter((i) => i.name.includes(recipeSearch.trim()) && !recipeLines.some((l) => l.barcode === i.id)).length === 0 && (
                  <p className="text-xs text-slate-400 p-2.5">لا توجد نتائج — سجّل الصنف أولاً من صفحة التكاليف</p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setRecipeTarget(null)}>إلغاء</Button>
            <Button onClick={applyRecipe}>حفظ الوصفة</Button>
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
