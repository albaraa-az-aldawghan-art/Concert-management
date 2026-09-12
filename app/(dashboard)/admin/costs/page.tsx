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
import { getSalesSections, setItemSections } from "@/lib/firestore/sales";
import { getVatRate } from "@/lib/firestore/settings";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { BarcodeLabelModal } from "@/components/ui/barcode-label-modal";
import { ExportDialog } from "@/components/ui/export-dialog";
import { COSTS_COLUMNS } from "@/lib/server/export-columns";
import { CameraScanModal } from "@/components/ui/camera-scan-modal";
import { SearchBox, Pagination, SortHeader, RangeFilter, inRange, ClearFiltersButton } from "@/components/ui/list-filters";
import { CostItem, CostSettings, CostDepartment, SalesSection } from "@/types";
import {
  Plus, Barcode, Pencil, Trash2, Printer, SlidersHorizontal, X, Upload, Package, Camera, FileSpreadsheet,
} from "lucide-react";

/** yyyy-mm-dd ← dd/mm/yyyy بأرقام لاتينية بلا انزياح منطقة زمنية */
function fmtDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const PAGE_SIZE = 50;

function kindOf(item: CostItem): "raw" | "produced" | "sale" {
  return item.kind ?? ((item.productionRecipe?.length ?? 0) > 0 ? "produced" : "raw");
}

type SortKey = "name" | "kind" | "unit" | "balance";

function ItemRow({
  item,
  canEdit,
  canDelete,
  canLabel,
  showDates,
  onEdit,
  onDelete,
  onLabel,
  onQuickKind,
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
  /** تغيير النوع من القائمة مباشرة — بلا فتح نافذة التعديل، لسرعة تصنيف عدد كبير من الأصناف */
  onQuickKind: (i: CostItem, kind: "raw" | "produced" | "sale") => void;
}) {
  const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
  const expired = !!item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10);
  const kind = kindOf(item);
  const kindClass = kind === "produced" ? "bg-violet-50 text-violet-700" : kind === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700";
  return (
    <tr className="border-b border-slate-100 last:border-0 bg-white">
      <td className="px-4 py-2.5 min-w-[10rem]">
        <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
        <span className="font-mono text-[10px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
          {item.id}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {canEdit ? (
          <select
            value={kind}
            onChange={(e) => onQuickKind(item, e.target.value as "raw" | "produced" | "sale")}
            className={`text-xs pr-2.5 pl-1 py-1 rounded-full font-medium whitespace-nowrap border-0 outline-none cursor-pointer ${kindClass}`}
          >
            <option value="raw">مادة خام</option>
            <option value="produced">منتج مُصنَّع</option>
            <option value="sale">منتج بيع</option>
          </select>
        ) : (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${kindClass}`}>
            {kind === "produced" ? "منتج مُصنَّع" : kind === "sale" ? "منتج بيع" : "مادة خام"}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-sm text-slate-600 whitespace-nowrap">{item.unit}</td>
      <td className="px-4 py-2.5 tabular-nums-auto whitespace-nowrap">
        <span className={`text-sm font-medium ${balance <= 0 ? "text-red-600" : "text-emerald-700"}`}>
          {balance} {item.unit}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
            item.barcodeSource === "supplier" ? "bg-[#EEF1F7] text-[#1C2D50]" : "bg-amber-50 text-amber-700"
          }`}
        >
          {item.barcodeSource === "supplier" ? "باركود المصنّع" : "باركود مولّد"}
        </span>
      </td>
      {showDates && (
        <td className="px-4 py-2.5 whitespace-nowrap">
          {item.productionDate && (
            <span className="block text-[11px] text-slate-500 tabular-nums-auto">الإنتاج {fmtDate(item.productionDate)}</span>
          )}
          {item.expiryDate && (
            <span className={`block text-[11px] tabular-nums-auto ${expired ? "text-red-600 font-semibold" : "text-amber-600"}`}>
              {expired ? "منتهٍ" : "ينتهي"} {fmtDate(item.expiryDate)}
            </span>
          )}
        </td>
      )}
      <td className="px-4 py-2.5 w-28">
        <div className="flex items-center gap-1 justify-end">
          {canLabel && item.barcodeSource === "generated" && (
            <button onClick={() => onLabel(item)} className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors" title="طباعة الملصق">
              <Printer size={14} />
            </button>
          )}
          {canEdit && (
            <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors" title="تعديل">
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(item)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="حذف">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
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
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [vatRate, setVatRate] = useState(15);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | "raw" | "produced" | "sale">("");
  const [unitFilter, setUnitFilter] = useState("");
  const [balRange, setBalRange] = useState({ min: "", max: "" });
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
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
    productionDate: "", expiryDate: "", kind: "raw" as "raw" | "produced" | "sale",
  });
  /** أقسام البيع المختارة لصنف من نوع «منتج بيع» — تُضبط هنا لا فقط
   *  من صفحة منتجات البيع، فيُسعَّر الصنف ويظهر للبيع من مكان تسجيله. */
  const [saleSectionIds, setSaleSectionIds] = useState<string[]>([]);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkUnit, setBulkUnit] = useState("");

  const [unitInput, setUnitInput] = useState("");
  const [deptInput, setDeptInput] = useState("");

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, kindFilter, unitFilter, balRange]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function load() {
    setLoading(true);
    const [i, s, sec, vat] = await Promise.all([
      getCostItems(), getCostSettings(),
      getSalesSections().catch(() => [] as SalesSection[]),
      getVatRate().catch(() => 15),
    ]);
    setItems(i);
    setSettings(s);
    setSections(sec);
    setVatRate(vat);
    setLoading(false);
  }

  /** تصنيف سريع من القائمة — بلا فتح نافذة التعديل، مفيد عند تصنيف عدد كبير من الأصناف */
  async function quickSetKind(item: CostItem, kind: "raw" | "produced" | "sale") {
    const prev = items;
    setItems((p) => p.map((i) => (i.id === item.id ? { ...i, kind } : i)));
    try {
      await updateCostItem(item.id, { kind });
    } catch (err) {
      setItems(prev);
      showToast(err instanceof Error ? err.message : "تعذّر تحديث النوع", "error");
    }
  }

  function openAdd() {
    setForm({
      name: "", unit: settings.units[0] ?? "", barcodeMode: "generate", barcode: "",
      productionDate: "", expiryDate: "", kind: "raw",
    });
    setSaleSectionIds([]);
    setPriceInputs({});
    setShowAdd(true);
  }

  function openEdit(item: CostItem) {
    setEditTarget(item);
    setForm({
      name: item.name, unit: item.unit, barcodeMode: "generate", barcode: "",
      productionDate: item.productionDate ?? "", expiryDate: item.expiryDate ?? "",
      kind: kindOf(item),
    });
    setSaleSectionIds(item.salesSections ?? []);
    const prices: Record<string, string> = {};
    for (const id of item.salesSections ?? []) {
      const p = item.sectionPrices?.[id];
      if (p != null) prices[id] = String(p);
    }
    setPriceInputs(prices);
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
    // تسعير الأقسام المختارة فقط — قسم لا يُختار سعره لا يُرسَل
    const sectionPricesOf = (ids: string[]) => {
      const out: Record<string, number> = {};
      for (const id of ids) {
        const raw = priceInputs[id];
        const n = raw ? parseFloat(raw) : NaN;
        if (Number.isFinite(n) && n > 0) out[id] = n;
      }
      return out;
    };
    setSaving(true);
    try {
      if (editTarget) {
        // الانضمام للأقسام أولاً: تسعير قسم لا يضمّ الصنف بعد يُرفَض على الخادم
        await setItemSections(editTarget.id, saleSectionIds);
        await updateCostItem(editTarget.id, {
          name: form.name.trim(), unit: form.unit, ...dates,
          sectionPrices: sectionPricesOf(saleSectionIds), kind: form.kind,
        });
        showToast("تم تحديث الصنف");
        setEditTarget(null);
      } else if (form.barcodeMode === "supplier") {
        if (!form.barcode.trim()) { showToast("أدخل رقم الباركود", "error"); setSaving(false); return; }
        const barcode = form.barcode.trim();
        await createCostItemFromSupplierBarcode({
          name: form.name.trim(), unit: form.unit, barcode, ...dates, createdBy: appUser.uid, kind: form.kind,
        });
        if (form.kind === "sale" && saleSectionIds.length > 0) {
          await setItemSections(barcode, saleSectionIds);
          await updateCostItem(barcode, { sectionPrices: sectionPricesOf(saleSectionIds) });
        }
        showToast("تم تسجيل الصنف");
        setShowAdd(false);
      } else {
        const created = await createCostItemGenerated({ name: form.name.trim(), unit: form.unit, ...dates, createdBy: appUser.uid, kind: form.kind });
        if (form.kind === "sale" && saleSectionIds.length > 0) {
          await setItemSections(created.id, saleSectionIds);
          await updateCostItem(created.id, { sectionPrices: sectionPricesOf(saleSectionIds) });
        }
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
    const dept: CostDepartment = { name: v };
    setSettings((prev) => ({ ...prev, departments: [...prev.departments, dept] }));
    setDeptInput("");
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

  const unitOptions = [...new Set(items.map((i) => i.unit))].sort((a, b) => a.localeCompare(b, "ar"));

  const q = search.trim();
  const filtered = items.filter((i) => {
    if (q && !i.name.includes(q) && !i.id.includes(q)) return false;
    if (kindFilter && kindOf(i) !== kindFilter) return false;
    if (unitFilter && i.unit !== unitFilter) return false;
    if (!inRange((i.totalIn ?? 0) - (i.totalOut ?? 0), balRange.min, balRange.max)) return false;
    return true;
  });

  const SORT_VAL: Record<SortKey, (i: CostItem) => string | number> = {
    name: (i) => i.name, kind: (i) => kindOf(i), unit: (i) => i.unit,
    balance: (i) => (i.totalIn ?? 0) - (i.totalOut ?? 0),
  };
  const sorted = sortKey ? [...filtered].sort((a, b) => {
    const av = SORT_VAL[sortKey](a), bv = SORT_VAL[sortKey](b);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string, "ar") : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  }) : filtered;

  const hasActiveFilters = kindFilter !== "" || unitFilter !== "" || balRange.min !== "" || balRange.max !== "";
  function clearFilters() {
    setKindFilter(""); setUnitFilter(""); setBalRange({ min: "", max: "" });
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">أصناف التكاليف</h2>
          <p className="text-sm text-slate-500">
            {sorted.length === items.length ? `${items.length} صنف مسجّل` : `${sorted.length} من ${items.length} صنف`}
          </p>
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="max-w-xs flex-1">
          <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الباركود..." />
        </div>
        <ClearFiltersButton show={hasActiveFilters} onClear={clearFilters} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>{q || hasActiveFilters ? "لا توجد نتائج مطابقة" : "لا توجد أصناف تكاليف مسجّلة بعد"}</p>
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5"><SortHeader label="الاسم" sortKeyName="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="px-4 py-2.5"><SortHeader label="النوع" sortKeyName="kind" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="px-4 py-2.5"><SortHeader label="الوحدة" sortKeyName="unit" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="px-4 py-2.5"><SortHeader label="الرصيد" sortKeyName="balance" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="px-4 py-2.5 font-semibold">الباركود</th>
                  {showDates && <th className="px-4 py-2.5 font-semibold">التواريخ</th>}
                  <th className="px-4 py-2.5"></th>
                </tr>
                {/* صف الفلاتر — تحت رؤوس الأعمدة مباشرة */}
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2">
                    <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "" | "raw" | "produced" | "sale")}
                      className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-[11px] bg-white">
                      <option value="">الكل</option>
                      <option value="raw">مادة خام</option>
                      <option value="produced">منتج مُصنَّع</option>
                      <option value="sale">منتج بيع</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-[11px] bg-white">
                      <option value="">الكل</option>
                      {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <RangeFilter min={balRange.min} max={balRange.max}
                      onMin={(v) => setBalRange((r) => ({ ...r, min: v }))} onMax={(v) => setBalRange((r) => ({ ...r, max: v }))} />
                  </td>
                  <td className="px-4 py-2"></td>
                  {showDates && <td className="px-4 py-2"></td>}
                  <td className="px-4 py-2"></td>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canEdit={canEditItem}
                    canDelete={canDeleteItem}
                    canLabel={canLabel}
                    showDates={showDates}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onLabel={setLabelTarget}
                    onQuickKind={quickSetKind}
                  />
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
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
            <label className="text-sm font-semibold text-slate-700 block mb-2">نوع الصنف (تنظيمي — لا يخفي الصنف من أي قائمة)</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, kind: "raw" })}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${form.kind === "raw" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600"}`}>
                مادة خام
              </button>
              <button type="button" onClick={() => setForm({ ...form, kind: "produced" })}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${form.kind === "produced" ? "border-violet-600 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}>
                منتج مُصنَّع
              </button>
              <button type="button" onClick={() => setForm({ ...form, kind: "sale" })}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${form.kind === "sale" ? "border-amber-600 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"}`}>
                منتج بيع
              </button>
            </div>
            {form.kind === "sale" && (
              <p className="text-xs text-slate-500 mt-1.5">المادة النهائية الجاهزة للبيع — حدِّد قسمها وسعرها بالأسفل ليظهر في منتجات البيع.</p>
            )}
          </div>

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

          {(form.kind === "sale" || saleSectionIds.length > 0) && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">أقسام البيع وأسعارها</label>
              {sections.length === 0 ? (
                <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
                  لا توجد أقسام بيع بعد — أضِف قسماً من صفحة منتجات البيع أولاً.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {sections.map((s) => {
                      const active = saleSectionIds.includes(s.id);
                      return (
                        <button key={s.id} type="button"
                          onClick={() => setSaleSectionIds((prev) => active ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            active ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200 hover:border-amber-400"
                          }`}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  {saleSectionIds.length === 0 ? (
                    <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
                      اختر قسماً واحداً على الأقل ليظهر الصنف فيه ويُسعَّر.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {saleSectionIds.map((id) => {
                        const sec = sections.find((s) => s.id === id);
                        const raw = priceInputs[id] ?? "";
                        const gross = parseFloat(raw);
                        const hasPrice = Number.isFinite(gross) && gross > 0;
                        const net = hasPrice ? r2(gross / (1 + vatRate / 100)) : null;
                        return (
                          <div key={id} className="border border-slate-200 rounded-xl px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3 mb-1.5">
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {sec?.name ?? "قسم محذوف"}
                              </span>
                              <input
                                type="number" min={0} step="0.01" value={raw} placeholder="السعر شامل الضريبة"
                                onChange={(e) => setPriceInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                                className="w-32 border border-slate-200 rounded-lg px-2.5 py-1 text-sm text-left tabular-nums-auto"
                              />
                            </div>
                            {hasPrice && (
                              <p className="text-[11px] text-slate-500 tabular-nums-auto">
                                قبل الضريبة: {money(net!)} ريال · الضريبة ({vatRate}%): {money(r2(gross - net!))} ريال
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
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
              <Button type="button" variant="outline" size="sm" onClick={addDept}><Plus size={14} /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.departments.map((d) => (
                <span key={d.name} className="flex items-center gap-1 bg-amber-50 text-amber-700 text-sm px-3 py-1 rounded-full font-medium">
                  {d.name}
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
