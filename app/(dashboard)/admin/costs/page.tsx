"use client";

/* أصناف التكاليف: التسجيل وتوليد الباركود وطباعة الملصقات والوحدات والأقسام. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCostItems,
  createCostItemGenerated,
  createCostItemFromSupplierBarcode,
  updateCostItem,
  deleteCostItem,
  bulkCreateCostItems,
  getCostSettings,
  updateCostSettings,
} from "@/lib/firestore/costs";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { BarcodeLabelModal } from "@/components/ui/barcode-label-modal";
import { ExportDialog } from "@/components/ui/export-dialog";
import { COSTS_COLUMNS } from "@/lib/server/export-columns";
import { CameraScanModal } from "@/components/ui/camera-scan-modal";
import { SearchBox } from "@/components/ui/list-filters";
import { CostItem, CostSettings, CostDepartment } from "@/types";
import {
  Plus, Barcode, Pencil, Trash2, Printer, SlidersHorizontal, X, Upload, Package, Camera, FileSpreadsheet,
} from "lucide-react";

/** yyyy-mm-dd ← dd/mm/yyyy بأرقام لاتينية بلا انزياح منطقة زمنية */
function fmtDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

function ItemCard({
  item,
  canEdit,
  canDelete,
  canLabel,
  showDates,
  onEdit,
  onDelete,
  onLabel,
}: {
  item: CostItem;
  canEdit: boolean;
  canDelete: boolean;
  /** طباعة الملصق صلاحية مستقلة — الملصق يخرج من المستودع ويُلصق على بضاعة */
  canLabel: boolean;
  /** تاريخا الإنتاج والانتهاء: بيانات جودة قد لا تخصّ كل دور */
  showDates: boolean;
  onEdit: (i: CostItem) => void;
  onDelete: (i: CostItem) => void;
  onLabel: (i: CostItem) => void;
}) {
  const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
  const expired = !!item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-[15px] truncate">{item.name}</p>
          <span className="font-mono text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md inline-block mt-1">
            {item.id}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            item.barcodeSource === "supplier" ? "bg-[#EEF1F7] text-[#1C2D50]" : "bg-amber-50 text-amber-700"
          }`}
        >
          {item.barcodeSource === "supplier" ? "باركود المصنّع" : "باركود مولّد"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-medium">
          الوحدة: {item.unit}
        </span>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto ${
            balance <= 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          الرصيد {balance} {item.unit}
        </span>
        {showDates && item.productionDate && (
          <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto">
            الإنتاج {fmtDate(item.productionDate)}
          </span>
        )}
        {showDates && item.expiryDate && (
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto ${
              expired ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
            }`}
          >
            {expired ? "منتهٍ" : "ينتهي"} {fmtDate(item.expiryDate)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
        {canLabel && item.barcodeSource === "generated" && (
          <button
            onClick={() => onLabel(item)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#1C2D50] hover:bg-[#EEF1F7] px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Printer size={13} /> طباعة الملصق
          </button>
        )}
        <div className="mr-auto flex gap-1">
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
      </div>
    </Card>
  );
}

export default function AdminCostsPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  /* كل إجراء مفتاحه: من يسجّل صنفاً قد لا يُسمح له بحذفه ولا بتغيير الوحدات */
  const canAdd = isAdmin || feat("costs", "item_add");
  const canEditItem = isAdmin || feat("costs", "item_edit");
  const canDeleteItem = isAdmin || feat("costs", "item_delete");
  const canImport = isAdmin || feat("costs", "item_import");
  const canLabel = isAdmin || feat("costs", "item_barcode");
  const canConfig = isAdmin || feat("costs", "item_config");
  const canExport = isAdmin || feat("costs", "export");
  const showDates = isAdmin || feat("costs", "if_dates");
  const showAvgCost = isAdmin || feat("costs", "if_avg_cost");

  const [items, setItems] = useState<CostItem[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTarget, setEditTarget] = useState<CostItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CostItem | null>(null);
  const [labelTarget, setLabelTarget] = useState<CostItem | null>(null);
  const [showBarcodeCamera, setShowBarcodeCamera] = useState(false);

  const [form, setForm] = useState({
    name: "", unit: "", barcodeMode: "generate" as "generate" | "supplier", barcode: "",
    productionDate: "", expiryDate: "",
  });
  const [bulkNames, setBulkNames] = useState("");
  const [bulkUnit, setBulkUnit] = useState("");

  const [unitInput, setUnitInput] = useState("");
  const [deptInput, setDeptInput] = useState("");
  const [deptConcertLinked, setDeptConcertLinked] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [i, s] = await Promise.all([getCostItems(), getCostSettings()]);
    setItems(i);
    setSettings(s);
    setLoading(false);
  }

  function openAdd() {
    setForm({
      name: "", unit: settings.units[0] ?? "", barcodeMode: "generate", barcode: "",
      productionDate: "", expiryDate: "",
    });
    setShowAdd(true);
  }

  function openEdit(item: CostItem) {
    setEditTarget(item);
    setForm({
      name: item.name, unit: item.unit, barcodeMode: "generate", barcode: "",
      productionDate: item.productionDate ?? "", expiryDate: item.expiryDate ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !form.name.trim() || !form.unit) return;
    // تاريخ انتهاء أسبق من تاريخ الإنتاج يُطبع على الملصق فيربك المستودع
    if (form.productionDate && form.expiryDate && form.expiryDate < form.productionDate) {
      showToast("تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج", "error");
      return;
    }
    const dates = { productionDate: form.productionDate || null, expiryDate: form.expiryDate || null };
    setSaving(true);
    try {
      if (editTarget) {
        await updateCostItem(editTarget.id, { name: form.name.trim(), unit: form.unit, ...dates });
        showToast("تم تحديث الصنف");
        setEditTarget(null);
      } else if (form.barcodeMode === "supplier") {
        if (!form.barcode.trim()) { showToast("أدخل رقم الباركود", "error"); setSaving(false); return; }
        await createCostItemFromSupplierBarcode({
          name: form.name.trim(), unit: form.unit, barcode: form.barcode.trim(), ...dates, createdBy: appUser.uid,
        });
        showToast("تم تسجيل الصنف");
        setShowAdd(false);
      } else {
        const created = await createCostItemGenerated({ name: form.name.trim(), unit: form.unit, ...dates, createdBy: appUser.uid });
        showToast("تم تسجيل الصنف وتوليد باركوده");
        setShowAdd(false);
        setLabelTarget(created);
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport() {
    if (!appUser || !bulkUnit) return;
    const names = bulkNames.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) { showToast("أدخل اسماً واحداً على الأقل", "error"); return; }
    setSaving(true);
    try {
      await bulkCreateCostItems(names, bulkUnit, appUser.uid);
      showToast(`تم تسجيل ${names.length} صنفاً بنجاح`);
      setShowBulk(false);
      setBulkNames("");
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
      await deleteCostItem(deleteTarget.id);
      showToast("تم حذف الصنف");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  function addUnit() {
    const v = unitInput.trim();
    if (!v || settings.units.includes(v)) return;
    setSettings((prev) => ({ ...prev, units: [...prev.units, v] }));
    setUnitInput("");
  }
  function removeUnit(u: string) {
    setSettings((prev) => ({ ...prev, units: prev.units.filter((x) => x !== u) }));
  }
  function addDept() {
    const v = deptInput.trim();
    if (!v || settings.departments.some((d) => d.name === v)) return;
    const dept: CostDepartment = { name: v, concertLinked: deptConcertLinked };
    setSettings((prev) => ({ ...prev, departments: [...prev.departments, dept] }));
    setDeptInput("");
    setDeptConcertLinked(false);
  }
  function removeDept(name: string) {
    setSettings((prev) => ({ ...prev, departments: prev.departments.filter((d) => d.name !== name) }));
  }
  async function saveSettings() {
    setSaving(true);
    try {
      await updateCostSettings(settings);
      showToast("تم حفظ الوحدات والأقسام");
      setShowSettings(false);
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = search.trim();
  const filtered = items.filter((i) => !q || i.name.includes(q) || i.id.includes(q));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">أصناف التكاليف</h2>
          <p className="text-sm text-slate-500">{items.length} صنف مسجّل</p>
        </div>
        {/* صلاحية مستقلة: رؤية الأصناف لا تعني حقّ إخراجها ملفاً */}
        {canExport && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
              <FileSpreadsheet size={14} /> تصدير إكسل
            </Button>
          </div>
        )}
        {(canConfig || canImport || canAdd) && (
          <div className="flex gap-2 flex-wrap">
            {canConfig && (
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
                <SlidersHorizontal size={14} /> الوحدات والأقسام
              </Button>
            )}
            {canImport && (
              <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>
                <Upload size={14} /> استيراد دفعة
              </Button>
            )}
            {canAdd && (
              <Button size="sm" onClick={openAdd}>
                <Plus size={16} /> تسجيل صنف جديد
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="max-w-xs">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الباركود..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>{q ? "لا توجد نتائج مطابقة للبحث" : "لا توجد أصناف تكاليف مسجّلة بعد"}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              canEdit={canEditItem}
              canDelete={canDeleteItem}
              canLabel={canLabel}
              showDates={showDates}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onLabel={setLabelTarget}
            />
          ))}
        </div>
      )}

      {/* Add / Edit */}
      <Modal open={showAdd || !!editTarget} onClose={() => { setShowAdd(false); setEditTarget(null); }} title={editTarget ? "تعديل الصنف" : "تسجيل صنف جديد"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="اسم الصنف" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: لحم بقر بدون عظم" />
          <Select label="الوحدة (ثابتة لهذا الصنف دائماً)" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="" disabled>اختر الوحدة</option>
            {settings.units.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="تاريخ الإنتاج (من)" type="date" value={form.productionDate}
                onChange={(e) => setForm({ ...form, productionDate: e.target.value })} />
              <Input label="تاريخ الانتهاء (إلى)" type="date" value={form.expiryDate}
                min={form.productionDate || undefined}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">اختياريان — إن أُدخلا طُبعا على ملصق الباركود.</p>
          </div>

          {!editTarget && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">الباركود</label>
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setForm({ ...form, barcodeMode: "supplier" })}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${form.barcodeMode === "supplier" ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600"}`}>
                  مسح/كتابة باركود من المورد
                </button>
                <button type="button" onClick={() => setForm({ ...form, barcodeMode: "generate" })}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${form.barcodeMode === "generate" ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600"}`}>
                  توليد باركود داخلي تلقائياً
                </button>
              </div>
              {form.barcodeMode === "supplier" ? (
                <div className="flex gap-2">
                  <Input className="flex-1" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="امسح الباركود أو اكتب رقمه" autoFocus />
                  <button type="button" onClick={() => setShowBarcodeCamera(true)}
                    className="shrink-0 px-3 rounded-xl border border-slate-200 text-slate-500 hover:text-[#1C2D50] hover:border-[#1C2D50] transition-colors" title="مسح بالكاميرا">
                    <Camera size={16} />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">سيُولَّد رقم باركود داخلي فريد تلقائياً بعد الحفظ، ويمكنك طباعته كملصق فوراً.</p>
              )}
            </div>
          )}
          {editTarget && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><Barcode size={12} /> الباركود: <span className="font-mono">{editTarget.id}</span> (لا يمكن تغييره)</p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditTarget(null); }}>إلغاء</Button>
            <Button type="submit" loading={saving}>{editTarget ? "حفظ التعديلات" : "تسجيل الصنف"}</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Import */}
      <Modal open={showBulk && canImport} onClose={() => setShowBulk(false)} title="استيراد عدة أصناف دفعة واحدة">
        <div className="space-y-4">
          <Textarea
            label="أسماء الأصناف (سطر لكل صنف)"
            rows={8}
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            placeholder={"لحم بقر بدون عظم\nخروف كامل\nسبانخ جاهزة للتشغيل\n..."}
          />
          <Select label="الوحدة المشتركة لهذه الدفعة" required value={bulkUnit} onChange={(e) => setBulkUnit(e.target.value)}>
            <option value="" disabled>اختر الوحدة</option>
            {settings.units.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <p className="text-xs text-slate-500">سيُولَّد باركود داخلي لكل صنف تلقائياً بنفس الوحدة المختارة. يمكنك تعديل وحدة أي صنف لاحقاً من بطاقته.</p>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowBulk(false)}>إلغاء</Button>
            <Button onClick={handleBulkImport} loading={saving}>استيراد</Button>
          </div>
        </div>
      </Modal>

      {/* Units & Departments Settings */}
      <Modal open={showSettings && canConfig} onClose={() => setShowSettings(false)} title="الوحدات والأقسام" size="lg">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">الوحدات</label>
            <div className="flex gap-2 mb-3">
              <input type="text" value={unitInput} onChange={(e) => setUnitInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }}
                placeholder="اكتب وحدة جديدة واضغط Enter..."
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
              <Button type="button" variant="outline" size="sm" onClick={addUnit}><Plus size={14} /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.units.map((u) => (
                <span key={u} className="flex items-center gap-1 bg-[#EEF1F7] text-[#1C2D50] text-sm px-3 py-1 rounded-full font-medium">
                  {u}
                  <button type="button" onClick={() => removeUnit(u)} className="text-blue-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-2">الأقسام</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              <input type="text" value={deptInput} onChange={(e) => setDeptInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDept(); } }}
                placeholder="اسم القسم..."
                className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
              <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <input type="checkbox" checked={deptConcertLinked} onChange={(e) => setDeptConcertLinked(e.target.checked)} />
                يرتبط بالحفلات
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addDept}><Plus size={14} /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.departments.map((d) => (
                <span key={d.name} className="flex items-center gap-1 bg-amber-50 text-amber-700 text-sm px-3 py-1 rounded-full font-medium">
                  {d.name}
                  {d.concertLinked && <span className="text-[10px] opacity-70">(حفلات)</span>}
                  <button type="button" onClick={() => removeDept(d.name)} className="text-amber-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowSettings(false)}>إلغاء</Button>
            <Button onClick={saveSettings} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <ExportDialog
        open={showExport && canExport}
        onClose={() => setShowExport(false)}
        kind="costs"
        columns={COSTS_COLUMNS}
        title="تصدير التكاليف إلى إكسل"
      />

      <BarcodeLabelModal open={!!labelTarget} onClose={() => setLabelTarget(null)} item={labelTarget} />

      <CameraScanModal
        open={showBarcodeCamera}
        onClose={() => setShowBarcodeCamera(false)}
        onScan={(scanned) => { setForm((prev) => ({ ...prev, barcode: scanned })); setShowBarcodeCamera(false); }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الصنف"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
