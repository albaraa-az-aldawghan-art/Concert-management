"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { CostItemsExportDialog } from "@/components/ui/cost-items-export-dialog";
import { RAW_MATERIAL_COLUMNS } from "@/lib/server/export-columns";
import { PageHeader, PageShell, LoadingState } from "@/components/ui/page";
import { SearchBox } from "@/components/ui/list-filters";
import {
  createCostItemGenerated,
  deleteCostItem,
  getCostIncoming,
  getCostItems,
  getCostOutgoing,
  getCostProductions,
  getCostSettings,
  deleteRawCategory,
  renameRawCategory,
  updateCostItem,
  updateCostSettings,
} from "@/lib/firestore/costs";
import { CostIncoming, CostItem, CostOutgoing, CostProduction, CostSettings } from "@/types";
import { FileSpreadsheet, FolderPlus, History, Package, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";

type Movement = { id: string; date: string; kind: string; quantity: number; note: string };
const emptyItem = { name: "", purchaseUnit: "", unit: "", purchaseToIssue: "", category: "" };

export default function RawMaterialsPage() {
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const canAddItem = isAdmin || feat("costs", "item_add");
  const canEditItem = isAdmin || feat("costs", "item_edit");
  const canDeleteItem = isAdmin || feat("costs", "item_delete");
  const canConfig = isAdmin || feat("costs", "item_config");
  const canIncoming = isAdmin || feat("costs", "in_add");
  const canExport = isAdmin || feat("costs", "export");

  const [items, setItems] = useState<CostItem[]>([]);
  const [incoming, setIncoming] = useState<CostIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [productions, setProductions] = useState<CostProduction[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [], rawCategories: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCategory, setShowCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);
  const [showItem, setShowItem] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementItem, setMovementItem] = useState<CostItem | null>(null);
  const [editItemTarget, setEditItemTarget] = useState<CostItem | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [deleteItemTarget, setDeleteItemTarget] = useState<CostItem | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [i, inc, out, prod, config] = await Promise.all([
        getCostItems(), getCostIncoming(), getCostOutgoing(), getCostProductions(), getCostSettings(),
      ]);
      setItems(i); setIncoming(inc); setOutgoing(out); setProductions(prod); setSettings(config);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    // التحميل الأولي مزامنة مع قاعدة البيانات، وبقية التحديثات تتم بعد عمليات المستخدم.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const rawItems = useMemo(() => items.filter((i) => (i.kind ?? "raw") === "raw"), [items]);
  const categories = settings.rawCategories ?? [];
  const filtered = rawItems.filter((i) =>
    (!search.trim() || i.name.includes(search.trim()) || i.id.includes(search.trim())) &&
    (!categoryFilter || (i.rawCategory ?? "") === categoryFilter)
  );
  const grouped = [
    ...categories.map((name) => ({ name, items: filtered.filter((i) => i.rawCategory === name) })),
    { name: "غير مصنّف", items: filtered.filter((i) => !i.rawCategory || !categories.includes(i.rawCategory)) },
  ].filter((g) => g.items.length > 0 || (g.name !== "غير مصنّف" && !search && !categoryFilter));

  async function addCategory() {
    const name = categoryName.trim();
    if (!name) return;
    if (categories.includes(name)) { showToast("هذا القسم موجود مسبقًا", "error"); return; }
    setSaving(true);
    try {
      const next = { ...settings, rawCategories: [...categories, name] };
      await updateCostSettings(next); setSettings(next); setCategoryName(""); setShowCategory(false);
      showToast("تمت إضافة قسم المواد الخام");
    } catch (e) { showToast(e instanceof Error ? e.message : "تعذّر إضافة القسم", "error"); }
    finally { setSaving(false); }
  }

  function openAddCategory() {
    setEditCategory(null);
    setCategoryName("");
    setShowCategory(true);
  }

  function openEditCategory(name: string) {
    setEditCategory(name);
    setCategoryName(name);
    setShowCategory(true);
  }

  async function saveCategory() {
    if (!editCategory) return addCategory();
    const newName = categoryName.trim();
    if (!newName || newName === editCategory) { setShowCategory(false); return; }
    if (categories.includes(newName)) { showToast("اسم القسم موجود مسبقًا", "error"); return; }
    setSaving(true);
    try {
      const result = await renameRawCategory(editCategory, newName);
      setSettings((current) => ({ ...current, rawCategories: result.rawCategories }));
      setItems((current) => current.map((item) => item.rawCategory === editCategory ? { ...item, rawCategory: newName } : item));
      if (categoryFilter === editCategory) setCategoryFilter(newName);
      setShowCategory(false); setEditCategory(null); setCategoryName("");
      showToast(`تم تعديل اسم القسم وتحديث ${result.affected} مادة`);
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تعديل القسم", "error"); }
    finally { setSaving(false); }
  }

  async function confirmDeleteCategory() {
    if (!deleteCategoryTarget) return;
    setSaving(true);
    try {
      const result = await deleteRawCategory(deleteCategoryTarget);
      setSettings((current) => ({ ...current, rawCategories: result.rawCategories }));
      setItems((current) => current.map((item) => item.rawCategory === deleteCategoryTarget ? { ...item, rawCategory: null } : item));
      if (categoryFilter === deleteCategoryTarget) setCategoryFilter("");
      setDeleteCategoryTarget(null);
      showToast(`تم حذف القسم ونقل ${result.affected} مادة إلى غير مصنّف`);
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حذف القسم", "error"); }
    finally { setSaving(false); }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    const purchaseToIssue = Number(itemForm.purchaseToIssue);
    if (!(purchaseToIssue > 0)) { showToast("أدخل عدد وحدات الصرف داخل وحدة الشراء", "error"); return; }
    setSaving(true);
    try {
      await createCostItemGenerated({
        name: itemForm.name.trim(), unit: itemForm.unit, purchaseUnit: itemForm.purchaseUnit,
        purchaseToIssue, createdBy: appUser.uid,
        kind: "raw", rawCategory: itemForm.category || null,
      });
      setShowItem(false); setItemForm(emptyItem); showToast("تمت إضافة المادة الخام"); await load();
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّرت إضافة المادة", "error"); }
    finally { setSaving(false); }
  }

  async function changeCategory(item: CostItem, rawCategory: string) {
    try {
      await updateCostItem(item.id, { rawCategory: rawCategory || null });
      setItems((current) => current.map((i) => i.id === item.id ? { ...i, rawCategory: rawCategory || null } : i));
      showToast("تم تحديث قسم المادة");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تحديث القسم", "error"); }
  }

  async function changeKind(item: CostItem, kind: "raw" | "produced" | "sale") {
    if (kind === (item.kind ?? "raw")) return;
    const label = kind === "raw" ? "مادة خام" : kind === "produced" ? "منتج مُصنَّع" : "منتج بيع";
    if (!window.confirm(`هل أنت موافق على تغيير نوع «${item.name}» إلى «${label}»؟ سينتقل الصنف إلى الصفحة المناسبة.`)) return;
    try {
      await updateCostItem(item.id, { kind });
      setItems((current) => current.map((i) => i.id === item.id ? { ...i, kind } : i));
      showToast(kind === "raw" ? "تم تحديث النوع" : "تم نقل الصنف إلى المنتجات والوصفات القياسية");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تحديث النوع", "error"); }
  }

  async function saveMinimumStock(item: CostItem, value: string) {
    const minimumStock = Math.max(0, Number(value) || 0);
    if (minimumStock === (item.minimumStock ?? 0)) return;
    try {
      await updateCostItem(item.id, { minimumStock });
      setItems((current) => current.map((i) => i.id === item.id ? { ...i, minimumStock } : i));
      showToast("تم حفظ الحد الأدنى للمادة");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حفظ الحد الأدنى", "error"); }
  }

  async function saveUnitSettings(item: CostItem, patch: Pick<CostItem, "purchaseUnit"> | Pick<CostItem, "purchaseToIssue"> | Pick<CostItem, "unit">) {
    try {
      await updateCostItem(item.id, patch);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
      showToast("تم تحديث وحدات المادة");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تحديث الوحدات", "error"); await load(); }
  }

  function openEditItem(item: CostItem) {
    setEditItemTarget(item);
    setEditItemName(item.name);
  }

  async function saveItemName(event: React.FormEvent) {
    event.preventDefault();
    if (!editItemTarget) return;
    const name = editItemName.trim();
    if (!name) { showToast("اكتب اسم المادة", "error"); return; }
    if (name === editItemTarget.name) { setEditItemTarget(null); return; }
    setSaving(true);
    try {
      await updateCostItem(editItemTarget.id, { name });
      setItems((current) => current.map((item) => item.id === editItemTarget.id ? { ...item, name } : item));
      setMovementItem((current) => current?.id === editItemTarget.id ? { ...current, name } : current);
      setEditItemTarget(null);
      setEditItemName("");
      showToast("تم تعديل اسم المادة وتحديث ارتباطاتها");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر تعديل اسم المادة", "error"); }
    finally { setSaving(false); }
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    setSaving(true);
    try {
      await deleteCostItem(deleteItemTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteItemTarget.id));
      if (movementItem?.id === deleteItemTarget.id) setMovementItem(null);
      setDeleteItemTarget(null);
      showToast("تم حذف المادة نهائيًا");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حذف المادة", "error"); }
    finally { setSaving(false); }
  }

  const movements: Movement[] = movementItem ? [
    ...incoming.filter((e) => e.itemBarcode === movementItem.id).map((e) => ({ id: `i-${e.id}`, date: e.invoiceDate, kind: "وارد", quantity: e.quantity, note: e.supplierName || "—" })),
    ...outgoing.filter((e) => e.itemBarcode === movementItem.id).map((e) => ({ id: `o-${e.id}`, date: e.dispenseDate, kind: "منصرف", quantity: -e.quantity, note: e.departmentName || e.concertName || "—" })),
    ...productions.flatMap((p) => p.inputs.filter((i) => i.barcode === movementItem.id).map((i) => ({ id: `p-${p.id}-${i.barcode}`, date: p.productionDate, kind: "استهلاك إنتاج", quantity: -i.qty, note: p.outputName }))),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];

  if (loading) return <LoadingState label="جارٍ تحميل المواد الخام..." />;

  return (
    <PageShell>
      <PageHeader title="المواد الخام" eyebrow="التكاليف" icon={Package}
        description="تنظيم الخامات حسب الأقسام، وتسجيل الوارد ومراجعة حركة كل مادة من مكان واحد"
        actions={<div className="flex gap-2 flex-wrap">
          {canExport && <Button variant="outline" onClick={() => setShowExport(true)}><FileSpreadsheet size={16} /> تصدير إكسل</Button>}
          {canConfig && <Button variant="outline" onClick={openAddCategory}><FolderPlus size={16} /> إضافة قسم</Button>}
          {canAddItem && <Button onClick={() => { setItemForm({ ...emptyItem, category: categoryFilter }); setShowItem(true); }}><Plus size={16} /> إضافة مادة خام</Button>}
          {canIncoming && <Link href="/admin/costs/incoming"><Button><PackagePlus size={16} /> فاتورة شراء جديدة</Button></Link>}
        </div>} />

      <div className="filter-panel">
        <div className="min-w-[220px] flex-1"><SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم المادة أو الباركود..." /></div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">كل الأقسام</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {grouped.length === 0 ? <Card className="py-12 text-center text-slate-400">لا توجد مواد خام مطابقة</Card> : grouped.map((group) => (
        <section key={group.name} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-slate-800">{group.name}</h2>
              {canConfig && group.name !== "غير مصنّف" && (
                <>
                  <button type="button" onClick={() => openEditCategory(group.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#1C2D50]" title="تعديل اسم القسم" aria-label={`تعديل قسم ${group.name}`}><Pencil size={14} /></button>
                  <button type="button" onClick={() => setDeleteCategoryTarget(group.name)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="حذف القسم" aria-label={`حذف قسم ${group.name}`}><Trash2 size={14} /></button>
                </>
              )}
            </div>
            <span className="text-xs text-slate-400">{group.items.length} مادة</span>
          </div>
          {group.items.length === 0 ? <Card className="py-8 text-center text-sm text-slate-400">القسم فارغ — أضف مادة خام إليه</Card> : (
            <div className="data-table-shell"><table className="data-table"><thead><tr>
              <th>المادة</th><th>النوع</th><th>القسم</th><th>الموردون</th><th>وحدة الشراء</th><th>وحدة الصرف</th><th>التحويل</th><th>الرصيد</th><th>الحد الأدنى</th><th>متوسط التكلفة</th><th>قيمة الرصيد</th><th>آخر وارد</th><th></th>
            </tr></thead><tbody>{group.items.map((item) => {
              const bal = (item.totalIn ?? 0) - (item.totalOut ?? 0);
              const avg = bal > 0 ? (item.totalInValue ?? 0) / bal : 0;
              const last = incoming.find((e) => e.itemBarcode === item.id);
              const suppliers = [...new Set(incoming.filter((e) => e.itemBarcode === item.id && e.supplierName).map((e) => e.supplierName))];
              const atMinimum = (item.minimumStock ?? 0) > 0 && bal <= (item.minimumStock ?? 0);
              return <tr key={item.id} className={atMinimum ? "bg-red-50" : ""}>
                <td><p className={`font-semibold ${atMinimum ? "text-red-700" : "text-slate-800"}`}>{item.name}</p>{atMinimum && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">وصل للحد الأدنى</span>}<p className="text-[11px] text-slate-400 font-mono">{item.id}</p></td>
                <td><select value={item.kind ?? "raw"} onChange={(e) => changeKind(item, e.target.value as "raw" | "produced" | "sale")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="raw">مادة خام</option><option value="produced">منتج مُصنَّع</option><option value="sale">منتج بيع</option></select></td>
                <td>{canEditItem ? <select value={item.rawCategory ?? ""} onChange={(e) => changeCategory(item, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="">غير مصنّف</option>{categories.map((c) => <option key={c}>{c}</option>)}</select> : (item.rawCategory ?? "غير مصنّف")}</td>
                <td>{suppliers.length ? <div className="flex flex-wrap gap-1">{suppliers.map((supplier) => <span key={supplier} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{supplier}</span>)}</div> : <span className="text-slate-400">—</span>}</td>
                <td>{canEditItem ? <select value={item.purchaseUnit || item.unit} onChange={(e) => saveUnitSettings(item, { purchaseUnit: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">{settings.units.map((unit) => <option key={unit}>{unit}</option>)}</select> : (item.purchaseUnit || item.unit)}</td>
                <td>{canEditItem ? <select value={item.unit} onChange={(e) => saveUnitSettings(item, { unit: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">{settings.units.map((unit) => <option key={unit}>{unit}</option>)}</select> : item.unit}</td>
                <td><div className="flex min-w-32 items-center gap-1 text-xs"><span>1</span><span>{item.purchaseUnit || item.unit}</span><span>=</span>{canEditItem ? <input type="number" min="0.001" step="0.001" defaultValue={item.purchaseToIssue ?? 1} onBlur={(e) => { const value = Number(e.target.value); if (value > 0 && value !== (item.purchaseToIssue ?? 1)) saveUnitSettings(item, { purchaseToIssue: value }); }} className="w-16 rounded-lg border border-slate-200 px-2 py-1" /> : <strong>{item.purchaseToIssue ?? 1}</strong>}<span>{item.unit}</span></div></td>
                <td className={`font-semibold tabular-nums-auto ${atMinimum ? "text-red-700" : ""}`}>{bal.toLocaleString("en-US")}</td>
                <td><input type="number" min="0" step="0.01" defaultValue={(item.minimumStock ?? 0) === 0 ? "" : item.minimumStock} onBlur={(e) => saveMinimumStock(item, e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs" /></td>
                <td className="tabular-nums-auto">{avg.toLocaleString("en-US", { maximumFractionDigits: 2 })} ريال</td>
                <td className="tabular-nums-auto">{(item.totalInValue ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ريال</td>
                <td className="text-slate-500 tabular-nums-auto">{last?.invoiceDate ?? "—"}</td>
                <td><div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setMovementItem(item)}><History size={14} /> عرض الحركة</Button>
                  {canEditItem && <button type="button" onClick={() => openEditItem(item)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1C2D50]" title="تعديل اسم المادة" aria-label={`تعديل اسم ${item.name}`}><Pencil size={15} /></button>}
                  {canDeleteItem && <button type="button" onClick={() => setDeleteItemTarget(item)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="حذف المادة نهائيًا" aria-label={`حذف ${item.name}`}><Trash2 size={15} /></button>}
                </div></td>
              </tr>;
            })}</tbody></table></div>
          )}
        </section>
      ))}

      <CostItemsExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        scope="raw"
        columns={RAW_MATERIAL_COLUMNS}
        title="تصدير المواد الخام إلى إكسل"
        filename="المواد الخام.xlsx"
        items={items}
        incoming={incoming}
      />

      <Modal open={showCategory} onClose={() => { setShowCategory(false); setEditCategory(null); }} title={editCategory ? "تعديل اسم قسم المواد الخام" : "إضافة قسم للمواد الخام"}>
        <div className="space-y-4"><Input label="اسم القسم" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="مثال: اللحوم" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setShowCategory(false); setEditCategory(null); }}>إلغاء</Button><Button onClick={saveCategory} loading={saving}>{editCategory ? "حفظ التعديل" : "إضافة القسم"}</Button></div></div>
      </Modal>

      <ConfirmModal
        open={!!deleteCategoryTarget}
        onClose={() => setDeleteCategoryTarget(null)}
        onConfirm={confirmDeleteCategory}
        title="حذف قسم المواد الخام"
        message={`سيتم حذف قسم «${deleteCategoryTarget ?? ""}» ونقل مواده إلى «غير مصنّف». هل تريد المتابعة؟`}
        confirmLabel="حذف القسم"
        loading={saving}
      />

      <Modal open={showItem} onClose={() => setShowItem(false)} title="إضافة مادة خام">
        <form onSubmit={addItem} className="space-y-4">
          <Input label="اسم المادة" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label="وحدة الشراء" required value={itemForm.purchaseUnit} onChange={(e) => setItemForm({ ...itemForm, purchaseUnit: e.target.value })}><option value="" disabled>اختر وحدة الشراء</option>{settings.units.map((u) => <option key={u}>{u}</option>)}</Select>
            <Select label="وحدة الصرف" required value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}><option value="" disabled>اختر وحدة الصرف</option>{settings.units.map((u) => <option key={u}>{u}</option>)}</Select>
          </div>
          <Input label="عدد وحدات الصرف داخل وحدة شراء واحدة" type="number" min="0.001" step="0.001" required value={itemForm.purchaseToIssue} onChange={(e) => setItemForm({ ...itemForm, purchaseToIssue: e.target.value })} placeholder="مثال: الكرتون = 12 حبة" />
          <Select label="القسم" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}><option value="">غير مصنّف</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setShowItem(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ المادة</Button></div>
        </form>
      </Modal>

      <Modal open={!!editItemTarget} onClose={() => { setEditItemTarget(null); setEditItemName(""); }} title="تعديل اسم المادة الخام">
        <form onSubmit={saveItemName} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            الباركود ثابت ولا يتغير: <strong className="font-mono text-slate-700">{editItemTarget?.id}</strong>
          </div>
          <Input label="اسم المادة" required value={editItemName} onChange={(event) => setEditItemName(event.target.value)} autoFocus />
          <p className="text-xs leading-5 text-slate-500">سيظهر الاسم الجديد في المواد الخام ومنتجات البيع والبكجات وبنود التعاقدات المرتبطة، دون تغيير الحركات المالية السابقة.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => { setEditItemTarget(null); setEditItemName(""); }}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ الاسم</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteItemTarget}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={confirmDeleteItem}
        title="حذف المادة نهائيًا"
        message={`سيتم حذف «${deleteItemTarget?.name ?? ""}» نهائيًا ولا يمكن التراجع. حفاظًا على دقة المخزون، لن يسمح النظام بالحذف إذا كانت المادة مرتبطة بوارد أو منصرف أو تالف أو إنتاج أو وصفة. هل تريد المتابعة؟`}
        confirmLabel="حذف نهائي"
        loading={saving}
      />

      <Modal open={!!movementItem} onClose={() => setMovementItem(null)} title={`حركة المادة — ${movementItem?.name ?? ""}`} size="lg">
        {movementItem && <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">الحد الأدنى:</span> <strong className="mr-1 tabular-nums-auto">{(movementItem.minimumStock ?? 0).toLocaleString("en-US")} {movementItem.unit}</strong></div>}
        {movements.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد حركة مسجلة لهذه المادة</p> : <div className="data-table-shell"><table className="data-table"><thead><tr><th>التاريخ</th><th>الحركة</th><th>الكمية</th><th>البيان</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td>{m.date}</td><td>{m.kind}</td><td className={m.quantity >= 0 ? "text-emerald-700" : "text-red-700"}>{m.quantity > 0 ? "+" : ""}{m.quantity.toLocaleString("en-US")}</td><td>{m.note}</td></tr>)}</tbody></table></div>}
      </Modal>
    </PageShell>
  );
}
