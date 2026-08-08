"use client";

/* البكجات الجاهزة: مجموعة أصناف ومواد تُضاف للحفلة بضغطة واحدة ثم تُعدَّل. */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox } from "@/components/ui/list-filters";
import { getCostItems } from "@/lib/firestore/costs";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import {
  getPackages, addPackage, updatePackage, deletePackage,
  getSectionsOfChannel, itemsOfSection, PackageDraft,
} from "@/lib/firestore/sales";
import { itemBalance, averageCost } from "@/lib/recipes";
import { ConcertPackage, CostItem, WarehouseItem, SalesSection } from "@/types";
import {
  Boxes, Plus, Trash2, Pencil, X, Search, Package as PackageIcon,
  UtensilsCrossed, Info, Check,
} from "lucide-react";

interface DraftLine { barcode: string; quantity: string }
interface DraftMaterial { itemId: string; count: string }

export default function PackagesPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  // البكج يضبطه المدير أو مشرف الحفلات المخوَّل
  const canView = isAdmin || can("packages");
  const canCreate = isAdmin || feat("packages", "create");
  const canEdit = isAdmin || feat("packages", "edit");
  const canDelete = isAdmin || feat("packages", "delete");
  const canManage = canCreate || canEdit;

  const [packages, setPackages] = useState<ConcertPackage[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseItem[]>([]);
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ConcertPackage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConcertPackage | null>(null);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [materials, setMaterials] = useState<DraftMaterial[]>([]);
  const [pickTab, setPickTab] = useState<"food" | "materials">("food");
  const [pickSearch, setPickSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [p, i, w, s] = await Promise.all([
      getPackages().catch(() => [] as ConcertPackage[]),
      getCostItems().catch(() => [] as CostItem[]),
      getWarehouseItems().catch(() => [] as WarehouseItem[]),
      getSectionsOfChannel("concerts").catch(() => [] as SalesSection[]),
    ]);
    setPackages(p);
    setItems(i);
    setWarehouse(w);
    setSections(s);
    setLoading(false);
  }

  /** أصناف قناة الحفلات وحدها — البكج للحفلات فلا يُعرض له غيرها */
  const concertItems = items.filter((i) =>
    sections.some((s) => (i.salesSections ?? []).includes(s.id))
  );

  function openAdd() {
    setEditTarget(null);
    setName(""); setNotes(""); setLines([]); setMaterials([]);
    setPickTab("food"); setPickSearch("");
    setShowForm(true);
  }

  function openEdit(p: ConcertPackage) {
    setEditTarget(p);
    setName(p.name);
    setNotes(p.notes ?? "");
    setLines(p.items.map((i) => ({ barcode: i.barcode, quantity: String(i.quantity) })));
    setMaterials(p.materials.map((m) => ({ itemId: m.itemId, count: String(m.count) })));
    setPickTab("food"); setPickSearch("");
    setShowForm(true);
  }

  function toggleLine(barcode: string) {
    setLines((prev) =>
      prev.some((l) => l.barcode === barcode)
        ? prev.filter((l) => l.barcode !== barcode)
        : [...prev, { barcode, quantity: "1" }]
    );
  }

  function toggleMaterial(itemId: string) {
    setMaterials((prev) =>
      prev.some((m) => m.itemId === itemId)
        ? prev.filter((m) => m.itemId !== itemId)
        : [...prev, { itemId, count: "1" }]
    );
  }

  async function handleSave() {
    const draft: PackageDraft = {
      name: name.trim(),
      notes: notes.trim() || null,
      items: lines
        .map((l) => ({ barcode: l.barcode, quantity: parseFloat(l.quantity) || 0 }))
        .filter((l) => l.quantity > 0),
      materials: materials
        .map((m) => ({ itemId: m.itemId, count: parseInt(m.count) || 0 }))
        .filter((m) => m.count > 0),
    };
    if (!draft.name) { showToast("اكتب اسم البكج", "error"); return; }
    if (draft.items.length === 0 && draft.materials.length === 0) {
      showToast("أضف صنفاً أو مادة واحدة على الأقل بكمية", "error");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) await updatePackage(editTarget.id, draft);
      else await addPackage(draft);
      showToast(editTarget ? "حُفظت التعديلات" : "أُنشئ البكج");
      setShowForm(false);
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
      await deletePackage(deleteTarget.id);
      showToast("حُذف البكج");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  if (appUser && !canManage) {
    return <p className="text-center text-slate-400 py-12">إدارة البكجات للمدير ومن يُمنح الصلاحية</p>;
  }

  const q = search.trim();
  const shown = packages.filter((p) => !q || p.name.includes(q) || p.items.some((i) => i.itemName.includes(q)));

  const pq = pickSearch.trim();
  const foodChoices = concertItems.filter((i) => !pq || i.name.includes(pq) || i.id.includes(pq));
  const materialChoices = warehouse.filter((w) => !pq || w.name.includes(pq));

  /** تكلفة البكج التقديرية بمتوسط أسعار أصنافه */
  function draftCost() {
    const food = lines.reduce((s, l) => {
      const item = items.find((i) => i.id === l.barcode);
      return s + (parseFloat(l.quantity) || 0) * averageCost(item);
    }, 0);
    const mats = materials.reduce((s, m) => {
      const w = warehouse.find((x) => x.id === m.itemId);
      return s + (parseInt(m.count) || 0) * (w?.type === "external" ? (w.pricePerUnit ?? 0) : 0);
    }, 0);
    return Math.round((food + mats) * 100) / 100;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Boxes size={20} className="text-amber-600" />
            البكجات الجاهزة
          </h2>
          <p className="text-sm text-slate-500">{packages.length} بكج — تُضاف للحفلة بضغطة ثم تُعدَّل</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus size={16} /> بكج جديد
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          البكج قالب لا التزام: الضغط عليه في الحفلة يضيف أصنافه بكمياتها ومواده،
          ثم <strong>تحذف أو تزيد أو تنقص كما تشاء</strong> — ولا يتأثر البكج نفسه بما عدّلته في تلك الحفلة.
        </p>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم البكج أو صنف بداخله..." />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Boxes size={40} className="mb-3 opacity-40" />
          <p>{q ? "لا توجد نتائج مطابقة" : "لا توجد بكجات بعد"}</p>
          {!q && <p className="text-xs mt-1">أنشئ بكجاً من الأصناف التي تتكرّر في حفلاتك</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shown.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.items.length} صنف
                    {p.materials.length > 0 && ` · ${p.materials.length} مادة موارد`}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {p.notes && <p className="text-xs text-slate-500 mb-2">{p.notes}</p>}

              <div className="flex flex-wrap gap-1.5">
                {p.items.map((i) => (
                  <span key={i.barcode} className="text-xs bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
                    {i.itemName} × {i.quantity.toLocaleString("en-US")}
                  </span>
                ))}
                {p.materials.map((m) => (
                  <span key={m.itemId} className="text-xs bg-[#EEF1F7] text-[#1C2D50] px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
                    {m.itemName} × {m.count.toLocaleString("en-US")}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* إنشاء / تعديل */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editTarget ? `تعديل: ${editTarget.name}` : "بكج جديد"} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="اسم البكج" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="مثال: بكج الأعراس الكبير" required />
            <Input label="ملاحظة (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="لمن يُقترح، أو ما يميّزه" />
          </div>

          {/* المختار */}
          {(lines.length > 0 || materials.length > 0) && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-600">محتوى البكج</p>
                <span className="text-xs font-bold text-[#1C2D50] tabular-nums-auto">
                  تكلفة تقديرية: {draftCost().toLocaleString("en-US")} ريال
                </span>
              </div>

              {lines.map((l) => {
                const item = items.find((i) => i.id === l.barcode);
                return (
                  <div key={l.barcode} className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5">
                    <UtensilsCrossed size={12} className="text-orange-500 shrink-0" />
                    <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{item?.name ?? l.barcode}</span>
                    <input type="number" min={0} step="0.5" value={l.quantity}
                      onChange={(e) => setLines((prev) => prev.map((x) => x.barcode === l.barcode ? { ...x, quantity: e.target.value } : x))}
                      className="w-16 border border-orange-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                    <span className="text-[11px] text-slate-500 w-10 shrink-0">{item?.unit}</span>
                    <button onClick={() => toggleLine(l.barcode)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}

              {materials.map((m) => {
                const w = warehouse.find((x) => x.id === m.itemId);
                return (
                  <div key={m.itemId} className="flex items-center gap-2 bg-[#EEF1F7] border border-[#D4DCE8] rounded-lg px-2.5 py-1.5">
                    <PackageIcon size={12} className="text-[#1C2D50] shrink-0" />
                    <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{w?.name ?? m.itemId}</span>
                    <input type="number" min={0} step="1" value={m.count}
                      onChange={(e) => setMaterials((prev) => prev.map((x) => x.itemId === m.itemId ? { ...x, count: e.target.value } : x))}
                      className="w-16 border border-[#D4DCE8] rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                    <span className="text-[11px] text-slate-500 w-10 shrink-0">
                      {w?.type === "internal" ? "داخلية" : "خارجية"}
                    </span>
                    <button onClick={() => toggleMaterial(m.itemId)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* الاختيار */}
          <div>
            <div className="flex gap-2 mb-2">
              {([
                { k: "food", l: "أصناف الأكل", n: concertItems.length },
                { k: "materials", l: "مواد الموارد", n: warehouse.length },
              ] as const).map((t) => (
                <button key={t.k} type="button" onClick={() => { setPickTab(t.k); setPickSearch(""); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                    pickTab === t.k ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600"
                  }`}>
                  {t.l} ({t.n})
                </button>
              ))}
            </div>

            <div className="relative mb-2">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)}
                placeholder="ابحث..."
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>

            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {pickTab === "food" ? (
                foodChoices.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">
                    {concertItems.length === 0
                      ? "لا توجد أصناف تحت «مبيعات الحفلات» — حدّدها من منتجات البيع"
                      : "لا توجد نتائج مطابقة"}
                  </p>
                ) : foodChoices.map((i) => {
                  const on = lines.some((l) => l.barcode === i.id);
                  return (
                    <button key={i.id} type="button" onClick={() => toggleLine(i.id)}
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5">
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        on ? "bg-orange-500 border-orange-500" : "border-slate-300"
                      }`}>
                        {on && <Check size={11} className="text-white" />}
                      </span>
                      <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{i.name}</span>
                      <span className="text-[11px] text-slate-400 tabular-nums-auto shrink-0">
                        {itemBalance(i).toLocaleString("en-US")} {i.unit}
                      </span>
                    </button>
                  );
                })
              ) : (
                materialChoices.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">لا توجد مواد مطابقة</p>
                ) : materialChoices.map((w) => {
                  const on = materials.some((m) => m.itemId === w.id);
                  return (
                    <button key={w.id} type="button" onClick={() => toggleMaterial(w.id)}
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5">
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        on ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300"
                      }`}>
                        {on && <Check size={11} className="text-white" />}
                      </span>
                      <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{w.name}</span>
                      <span className="text-[11px] text-slate-400 tabular-nums-auto shrink-0">
                        متاح {w.availableCount.toLocaleString("en-US")}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave} loading={saving}>
              {editTarget ? "حفظ التعديلات" : "إنشاء البكج"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف البكج"
        message={`سيُحذف بكج «${deleteTarget?.name}». الحفلات التي أُضيف إليها سابقاً لا تتأثر. متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
