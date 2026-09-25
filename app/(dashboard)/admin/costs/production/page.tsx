"use client";

/* الإنتاج: دمج الخامات في خلطة جاهزة لها باركود وتكلفة وحدة محسوبة. */
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/ui/feature-gate";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCostItems, getCostProductions, addCostProduction, updateCostProduction, deleteCostProduction,
  updateProductionRecipe, createCostItemGenerated, updateCostItem, getCostSettings,
} from "@/lib/firestore/costs";
import { BarcodeLabelModal } from "@/components/ui/barcode-label-modal";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox, Pagination, SortHeader, ClearFiltersButton } from "@/components/ui/list-filters";
import { CostItem, CostProduction, RecipeLine, SalesSection, SalesChannel, SALES_CHANNELS } from "@/types";
import { getSalesSections } from "@/lib/firestore/sales";
import { averageCost, itemBalance } from "@/lib/recipes";
import { Plus, FlaskConical, Trash2, X, Save, AlertTriangle, Barcode, Printer, Pencil } from "lucide-react";

const r2 = (n: number) => Math.round(n * 100) / 100;
const RECIPE_PAGE_SIZE = 50;

interface InputLine { barcode: string; itemName: string; unit: string; qty: string; }

const DAY_MS = 86400000;

/** مدة صلاحية الصنف بالأيام مأخوذة من آخر دفعة — تُعاد على الدفعة الجديدة
 *  فلا يُعاد حسابها يدوياً كل مرة. حساب بالـUTC كي لا ينزاح يوم. */
function shelfLifeDays(item: CostItem): number | null {
  if (!item.productionDate || !item.expiryDate) return null;
  const from = Date.parse(item.productionDate + "T00:00:00Z");
  const to = Date.parse(item.expiryDate + "T00:00:00Z");
  if (isNaN(from) || isNaN(to) || to <= from) return null;
  return Math.round((to - from) / DAY_MS);
}

function addDays(date: string, days: number): string {
  const t = Date.parse(date + "T00:00:00Z");
  return isNaN(t) ? "" : new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

function CostsProductionPageInner() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canRecord = isAdmin || feat("costs", "prod_add");
  const canView = isAdmin || feat("costs", "prod_view");
  const canEditEntry = isAdmin || feat("costs", "prod_edit");
  const canRecipe = isAdmin || feat("costs", "prod_recipe");
  const canLabel = isAdmin || feat("costs", "prod_label");
  const canDelete = isAdmin || feat("costs", "prod_delete");
  const fp = {
    inputs: isAdmin || feat("costs", "prf_inputs"),
  };

  const [items, setItems] = useState<CostItem[]>([]);
  const [productions, setProductions] = useState<CostProduction[]>([]);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  /** غير null أثناء تعديل عملية قائمة — الصنف المُنتَج يبقى ثابتاً حينها */
  const [editTarget, setEditTarget] = useState<CostProduction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CostProduction | null>(null);
  /* أقسام البيع: تُختار مع الإنتاج لا في خطوة لاحقة تُنسى */
  const [sections, setSections] = useState<SalesSection[]>([]);
  const [pickedSections, setPickedSections] = useState<string[]>([]);
  const [sectionChannel, setSectionChannel] = useState<SalesChannel>("restaurant");
  const [output, setOutput] = useState<CostItem | null>(null);
  const [outputSearch, setOutputSearch] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [inputs, setInputs] = useState<InputLine[]>([]);
  const [inputSearch, setInputSearch] = useState("");
  const [prodDate, setProdDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [units, setUnits] = useState<string[]>([]);
  const [creatingOutput, setCreatingOutput] = useState(false);
  const [newOutputUnit, setNewOutputUnit] = useState("");
  /** منتج بيع (يُختار للعميل مباشرة) أم إنتاج وسيط (مكوّن يدخل في وصفة أخرى) */
  const [newOutputKind, setNewOutputKind] = useState<"produced" | "sale">("produced");
  const [creatingInput, setCreatingInput] = useState(false);
  const [newInputUnit, setNewInputUnit] = useState("");
  const [labelTarget, setLabelTarget] = useState<
    { id: string; name: string; productionDate?: string | null; expiryDate?: string | null } | null
  >(null);
  const [notes, setNotes] = useState("");
  /* الوصفات القياسية القابلة للإنتاج — لوحة منفصلة عن سجل العمليات فعلياً */
  const [showRecipes, setShowRecipes] = useState(true);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeStatusFilter, setRecipeStatusFilter] = useState<"" | "ready" | "short" | "missing" | "raw" | "sale">("");
  const [recipeTypeFilter, setRecipeTypeFilter] = useState("");
  const [recipeSectionFilter, setRecipeSectionFilter] = useState("");
  const [recipeUnitFilter, setRecipeUnitFilter] = useState("");
  const [recipeBarcodeFilter, setRecipeBarcodeFilter] = useState("");
  const [recipeBalanceFilter, setRecipeBalanceFilter] = useState("");
  const [recipeOperationFilter, setRecipeOperationFilter] = useState("");
  const [recipeMinimumFilter, setRecipeMinimumFilter] = useState("");
  const [recipeIngredientFilter, setRecipeIngredientFilter] = useState("");
  const [recipeSortKey, setRecipeSortKey] = useState<"name" | "status" | null>(null);
  const [recipeSortDir, setRecipeSortDir] = useState<"asc" | "desc">("asc");
  const [recipePage, setRecipePage] = useState(1);

  useEffect(() => { load(); }, []);
  useEffect(() => { setRecipePage(1); }, [recipeSearch, recipeStatusFilter, recipeTypeFilter, recipeSectionFilter, recipeUnitFilter, recipeBarcodeFilter, recipeBalanceFilter, recipeOperationFilter, recipeMinimumFilter, recipeIngredientFilter]);

  async function load() {
    const [i, p, st, sec] = await Promise.all([
      getCostItems(),
      getCostProductions().catch(() => [] as CostProduction[]),
      getCostSettings().catch(() => ({ units: [], departments: [] })),
      getSalesSections().catch(() => [] as SalesSection[]),
    ]);
    setItems(i);
    setProductions(p);
    setUnits(st.units);
    setSections(sec);
  }

  function openAdd() {
    setEditTarget(null);
    setOutput(null); setOutputSearch(""); setOutputQty("");
    setPickedSections([]); setSectionChannel("restaurant");
    setInputs([]); setInputSearch("");
    setProdDate(new Date().toISOString().slice(0, 10));
    setExpiryDate("");
    setNewOutputUnit(units[0] ?? "");
    setNewOutputKind("produced");
    setNotes("");
    setShowAdd(true);
  }

  /** تعديل عملية قائمة: الصنف المُنتَج يُقفل، وما عداه قابل للتصحيح.
   *  أقسام البيع لا تُعرض قابلة للتعديل — لم تُخزَّن على العملية بذاتها
   *  بل اتُّحدت على الصنف مرة عند الإنشاء، فلا يُعرف أي جزء منها يخصّها. */
  function openEdit(p: CostProduction) {
    setEditTarget(p);
    setOutput(items.find((i) => i.id === p.outputBarcode) ?? null);
    setOutputSearch("");
    setOutputQty(String(p.outputQty));
    setPickedSections([]);
    setSectionChannel("restaurant");
    setInputs(p.inputs.map((l) => ({ barcode: l.barcode, itemName: l.itemName, unit: l.unit, qty: String(l.qty) })));
    setInputSearch("");
    setProdDate(p.productionDate);
    setExpiryDate(p.expiryDate ?? "");
    setNotes(p.notes ?? "");
    setShowAdd(true);
  }

  function closeModal() {
    setShowAdd(false);
    setEditTarget(null);
  }

  /** المتاح لصنف خلال التعديل يشمل ما حجزته هذه العملية نفسها — فتصحيح
   *  كمية من 40 إلى 45 لا يُرفض بحجة أن الـ40 الأولى محجوزة بها بالذات. */
  function availableFor(barcode: string): number {
    const base = itemBalance(items.find((i) => i.id === barcode));
    if (!editTarget) return base;
    const old = editTarget.inputs.find((i) => i.barcode === barcode);
    return old ? r2(base + old.qty) : base;
  }

  /** متوسط سعر صنف أثناء التعديل — على رصيده وقيمته "المُعادين" بعد
   *  عكس أثر هذه العملية، كي تطابق معاينة التكلفة ما سيحسبه الخادم فعلاً */
  function avgCostFor(barcode: string): number {
    const it = items.find((i) => i.id === barcode);
    if (!editTarget || !it) return averageCost(it);
    const old = editTarget.inputs.find((i) => i.barcode === barcode);
    if (!old) return averageCost(it);
    const reversedBalance = r2(itemBalance(it) + old.qty);
    const reversedValue = r2((it.totalInValue ?? 0) + old.totalCost);
    return reversedBalance > 0 ? r2(reversedValue / reversedBalance) : 0;
  }

  /* اختيار المُنتَج يُعبّئ خلطته القياسية إن وُجدت */
  function pickOutput(item: CostItem) {
    setOutput(item);
    /* المنتج المعروف يأتي بأقسامه فلا يُعيد المستخدم اختيارها */
    setPickedSections(item.salesSections ?? []);
    setOutputSearch("");
    // مدة صلاحية آخر دفعة تُطبَّق على هذه الدفعة ابتداءً من تاريخ إنتاجها
    const days = shelfLifeDays(item);
    setExpiryDate(days != null && prodDate ? addDays(prodDate, days) : "");
    if (item.productionRecipe?.length) {
      setInputs(item.productionRecipe.map((l) => ({
        barcode: l.barcode, itemName: l.itemName, unit: l.unit, qty: l.qty != null ? String(l.qty) : "",
      })));
      if (!outputQty) setOutputQty(String(item.productionRecipe[0].perQty || 1));
    } else {
      setInputs([]);
    }
  }

  /* قفزة مباشرة من لوحة «الوصفات القياسية»: فتح النموذج مُعبَّأً بالكامل
     بلا الاعتماد على قيمة outputQty السابقة (قد تكون من جلسة سابقة).
     تُستخدم لتسجيل إنتاج فعلي (الوصفة جاهزة) ولتعديل الوصفة نفسها
     (بلا شرط الجاهزية — سطر بلا كمية يظهر حقلاً فارغاً يُعبَّأ الآن). */
  function openAddWithRecipe(item: CostItem) {
    setEditTarget(null);
    setOutput(item);
    setOutputSearch("");
    setPickedSections(item.salesSections ?? []);
    setSectionChannel("restaurant");
    const today = new Date().toISOString().slice(0, 10);
    setProdDate(today);
    const days = shelfLifeDays(item);
    setExpiryDate(days != null ? addDays(today, days) : "");
    setNewOutputUnit(units[0] ?? "");
    setNotes("");
    setInputSearch("");
    if (item.productionRecipe?.length) {
      setInputs(item.productionRecipe.map((l) => ({
        barcode: l.barcode, itemName: l.itemName, unit: l.unit, qty: l.qty != null ? String(l.qty) : "",
      })));
      setOutputQty(String(item.productionRecipe[0].perQty || 1));
    } else {
      setInputs([]);
      setOutputQty("");
    }
    setShowAdd(true);
  }

  /** أقصى كمية قابلة للإنتاج الآن من وصفة صنف، والخام الأضيق إن كانت
   *  ناقصة — حسابي بحت لا يمسّ القاعدة، فلا خطر من عرضه دائماً. */
  function producibility(item: CostItem): { maxQty: number; ready: boolean; shortageName: string | null } {
    const recipe = item.productionRecipe ?? [];
    if (!recipe.length) return { maxQty: 0, ready: false, shortageName: null };
    const perQty = recipe[0].perQty || 1;
    // سطر بلا كمية محدَّدة في الملف الأصلي (مكوّن "حسب الرغبة" لم يُقدَّر
    // رقمياً) لا يمكن التحقق من كفايته — الوصفة تُعتبر ناقصة لا جاهزة،
    // بدل تجاهل السطر بصمت وإظهارها جاهزة خطأً
    const incomplete = recipe.some((l) => typeof l.qty !== "number" || typeof l.perQty !== "number");
    if (incomplete) return { maxQty: 0, ready: false, shortageName: "الوصفة ناقصة الكمية" };
    let maxQty = Infinity;
    let shortageName: string | null = null;
    for (const line of recipe) {
      const per = line.perQty || 1;
      const maxFromLine = line.qty > 0 ? r2((availableFor(line.barcode) / line.qty) * per) : Infinity;
      if (maxFromLine < maxQty) { maxQty = maxFromLine; shortageName = line.itemName; }
    }
    if (!isFinite(maxQty)) maxQty = 0;
    const ready = maxQty >= perQty;
    return { maxQty, ready, shortageName: ready ? null : shortageName };
  }

  /* الصنف المُنتَج يُنشأ هنا ويُولَّد له باركوده — فالإنتاج هو لحظة ميلاده */
  async function createOutput() {
    const name = outputSearch.trim();
    if (!appUser || !name || !newOutputUnit) return;
    setCreatingOutput(true);
    try {
      const created = await createCostItemGenerated({
        name, unit: newOutputUnit,
        productionDate: prodDate || null, expiryDate: expiryDate || null,
        createdBy: appUser.uid, kind: newOutputKind,
      });
      setItems((prev) => [...prev, created]);
      setOutput(created);
      setOutputSearch("");
      setInputs([]);
      showToast(`أُنشئ الصنف وتولّد باركوده: ${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setCreatingOutput(false);
    }
  }

  /** تصنيف صنف مُنتَج موجود مسبقاً — من هنا مباشرة بلا فتح صفحة التكاليف */
  async function quickSetOutputKind(kind: "raw" | "produced" | "sale") {
    if (!output) return;
    const prevItems = items, prevOutput = output;
    setItems((p) => p.map((i) => (i.id === output.id ? { ...i, kind } : i)));
    setOutput((o) => (o ? { ...o, kind } : o));
    try {
      await updateCostItem(output.id, { kind });
    } catch (err) {
      setItems(prevItems);
      setOutput(prevOutput);
      showToast(err instanceof Error ? err.message : "تعذّر تحديث النوع", "error");
    }
  }

  function addInput(item: CostItem) {
    if (inputs.some((l) => l.barcode === item.id)) return;
    setInputs((prev) => [...prev, { barcode: item.id, itemName: item.name, unit: item.unit, qty: "" }]);
    setInputSearch("");
  }

  /* مادة خام غير مسجّلة بعد؟ تُنشأ هنا مباشرة وتُضاف كمكوّن فوراً — بلا حاجة للخروج لصفحة الأصناف أولاً */
  async function createInput() {
    const name = inputSearch.trim();
    if (!appUser || !name || !newInputUnit) return;
    setCreatingInput(true);
    try {
      const created = await createCostItemGenerated({
        name, unit: newInputUnit, createdBy: appUser.uid, kind: "raw",
      });
      setItems((prev) => [...prev, created]);
      addInput(created);
      showToast(`أُنشئت المادة وتولّد باركودها: ${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setCreatingInput(false);
    }
  }

  const parsedInputs = inputs
    .map((l) => ({ ...l, n: parseFloat(l.qty) || 0 }))
    .filter((l) => l.n > 0);

  const estimatedCost = parsedInputs.reduce((s, l) => s + avgCostFor(l.barcode) * l.n, 0);
  const outQty = parseFloat(outputQty) || 0;
  const unitCost = outQty > 0 ? estimatedCost / outQty : 0;

  const shortages = parsedInputs.filter((l) => l.n > availableFor(l.barcode));

  async function handleSave() {
    if (!appUser || !output) return;
    if (outQty <= 0) { showToast("أدخل كمية الإنتاج", "error"); return; }
    if (parsedInputs.length === 0) { showToast("أضف مادة خام واحدة على الأقل بكمية", "error"); return; }
    if (!editTarget && pickedSections.length === 0) {
      showToast("اختر القسم الذي يُضمّ إليه المنتج — بدونه لن يظهر عند الصرف", "error");
      return;
    }
    if (expiryDate && prodDate && expiryDate < prodDate) {
      showToast("تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج", "error");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await updateCostProduction(editTarget.id, {
          outputQty: outQty,
          inputs: parsedInputs.map((l) => ({ barcode: l.barcode, qty: l.n })),
          productionDate: prodDate,
          expiryDate: expiryDate || null,
          notes: notes.trim() || null,
        });
        showToast("تم حفظ تعديل الإنتاج");
        closeModal();
        load();
        return;
      }
      await addCostProduction({
        outputBarcode: output.id,
        outputQty: outQty,
        inputs: parsedInputs.map((l) => ({ barcode: l.barcode, qty: l.n })),
        sectionIds: pickedSections,
        productionDate: prodDate,
        expiryDate: expiryDate || null,
        notes: notes.trim() || null,
        createdBy: appUser.uid,
      });
      showToast("تم تسجيل الإنتاج");
      setShowAdd(false);
      if (output.barcodeSource === "generated") {
        setLabelTarget({
          id: output.id, name: output.name,
          productionDate: prodDate, expiryDate: expiryDate || null,
        });
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  /* حفظ المدخلات الحالية كخلطة قياسية لهذا المُنتَج */
  async function handleSaveRecipe() {
    if (!output || parsedInputs.length === 0 || outQty <= 0) return;
    setSaving(true);
    try {
      const recipe: RecipeLine[] = parsedInputs.map((l) => ({
        barcode: l.barcode, itemName: l.itemName, unit: l.unit, qty: l.n, perQty: outQty,
      }));
      await updateProductionRecipe(output.id, recipe);
      showToast(`حُفظت كخلطة قياسية لـ"${output.name}"`);
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
      await deleteCostProduction(deleteTarget);
      showToast("تم حذف عملية الإنتاج وإرجاع الكميات");
      setDeleteTarget(null);
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  // القائمتان تعرضان كل الأصناف افتراضياً، والبحث يضيّقها — لا يُشترط
  // أن يتذكّر المستخدم الاسم قبل أن يرى ما لديه
  // وسم تنظيمي فقط لا يُخفي أي صنف — منتج قد يُستهلك بدوره كمكوّن في وصفة أخرى
  const kindOf = (i: CostItem) => i.kind ?? ((i.productionRecipe?.length ?? 0) > 0 ? "produced" : "raw");
  const byKind = (first: "produced" | "raw") => (a: CostItem, b: CostItem) =>
    kindOf(a) === kindOf(b) ? 0 : kindOf(a) === first ? -1 : 1;

  const oq = outputSearch.trim();
  const outputChoices = (oq ? items.filter((i) => i.name.includes(oq) || i.id.includes(oq)) : items)
    .slice().sort(byKind("produced"));
  const iq = inputSearch.trim();
  const available = items.filter((i) => i.id !== output?.id && !inputs.some((l) => l.barcode === i.id))
    .slice().sort(byKind("raw"));
  const inputChoices = iq ? available.filter((i) => i.name.includes(iq) || i.id.includes(iq)) : available;

  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  /* لوحة الوصفات القياسية: كل صنف له وصفة، جاهزه أولاً فغير الجاهزة —
     فالعمل يبدأ بما يمكن تنفيذه فعلاً لا بأبجدية الأسماء. وجود اللوحة
     نفسها يعتمد على القائمة الكاملة لا المفلترة بالبحث — وإلا اختفت
     اللوحة بحقل بحثها معاً متى بحثت عن شيء بلا نتيجة، فتعلق بلا طريقة
     لمسح البحث والرجوع. */
  // جدول موحّد: كل أصناف التكاليف تظهر مرة واحدة، والمنتج هو الاسم الثابت
  // للعمود الأول. الوصفة والحالة معلومات إضافية للمنتجات المصنّعة.
  const allRecipeItems = items
    .map((i) => ({ item: i, ...producibility(i) }))
    .sort((a, b) => (a.ready === b.ready ? a.item.name.localeCompare(b.item.name, "ar") : a.ready ? -1 : 1));
  const readyCount = allRecipeItems.filter((r) => r.item.kind === "produced" && r.ready).length;
  const needsRecipeCount = allRecipeItems.filter((r) => r.item.kind === "produced" && (r.item.productionRecipe?.length ?? 0) === 0).length;

  const recipeStatus = (r: (typeof allRecipeItems)[number]): "ready" | "short" | "missing" | "raw" | "sale" => {
    if ((r.item.kind ?? "raw") === "raw") return "raw";
    if (r.item.kind === "sale" && (r.item.productionRecipe?.length ?? 0) === 0) return "sale";
    return (r.item.productionRecipe?.length ?? 0) === 0 ? "missing" : r.ready ? "ready" : "short";
  };

  const rq = recipeSearch.trim();
  const recipeFiltered = allRecipeItems
    .filter((r) => !rq || r.item.name.includes(rq) || r.item.id.includes(rq))
    .filter((r) => !recipeStatusFilter || recipeStatus(r) === recipeStatusFilter)
    .filter((r) => !recipeTypeFilter || (r.item.kind ?? "raw") === recipeTypeFilter)
    .filter((r) => !recipeSectionFilter || (r.item.salesSections ?? []).includes(recipeSectionFilter) || r.item.rawCategory === recipeSectionFilter)
    .filter((r) => !recipeUnitFilter || r.item.unit === recipeUnitFilter)
    .filter((r) => !recipeBarcodeFilter.trim() || r.item.id.includes(recipeBarcodeFilter.trim()))
    .filter((r) => recipeBalanceFilter === "" || ((r.item.totalIn ?? 0) - (r.item.totalOut ?? 0)) <= Number(recipeBalanceFilter))
    .filter((r) => recipeMinimumFilter === "" || (r.item.minimumStock ?? 0) >= Number(recipeMinimumFilter))
    .filter((r) => !recipeIngredientFilter.trim() || (r.item.productionRecipe ?? []).some((line) => line.itemName.includes(recipeIngredientFilter.trim())))
    .filter((r) => !recipeOperationFilter || (recipeOperationFilter === "yes" ? productions.some((p) => p.outputBarcode === r.item.id) : !productions.some((p) => p.outputBarcode === r.item.id)));

  const recipeUnits = [...new Set(items.map((item) => item.unit))].sort((a, b) => a.localeCompare(b, "ar"));

  async function confirmItemChange(item: CostItem, field: "kind" | "salesSections", value: string) {
    const label = field === "kind" ? "نوع المنتج" : "قسم المنتج";
    if (!window.confirm(`هل أنت موافق على تغيير ${label} للمنتج «${item.name}»؟`)) return;
    try {
      const patch = field === "kind" ? { kind: value as "raw" | "produced" | "sale" } : { salesSections: value ? [value] : [] };
      await updateCostItem(item.id, patch);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
      showToast(`تم تحديث ${label}`);
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حفظ التغيير", "error"); }
  }

  async function saveMinimumStock(item: CostItem, value: string) {
    const minimumStock = Math.max(0, Number(value) || 0);
    if (minimumStock === (item.minimumStock ?? 0)) return;
    try {
      await updateCostItem(item.id, { minimumStock });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, minimumStock } : entry));
      showToast("تم حفظ الحد الأدنى");
    } catch (err) { showToast(err instanceof Error ? err.message : "تعذّر حفظ الحد الأدنى", "error"); }
  }

  const recipeItems = recipeSortKey ? [...recipeFiltered].sort((a, b) => {
    const av = recipeSortKey === "name" ? a.item.name : recipeStatus(a);
    const bv = recipeSortKey === "name" ? b.item.name : recipeStatus(b);
    const cmp = av.localeCompare(bv, "ar");
    return recipeSortDir === "asc" ? cmp : -cmp;
  }) : recipeFiltered;
  const recipeTotalPages = Math.max(1, Math.ceil(recipeItems.length / RECIPE_PAGE_SIZE));
  const safeRecipePage = Math.min(recipePage, recipeTotalPages);
  const paginatedRecipeItems = recipeItems.slice((safeRecipePage - 1) * RECIPE_PAGE_SIZE, safeRecipePage * RECIPE_PAGE_SIZE);

  function toggleRecipeSort(key: "name" | "status") {
    if (recipeSortKey === key) setRecipeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setRecipeSortKey(key); setRecipeSortDir("asc"); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">المنتجات والوصفات القياسية</h2>
          <p className="text-sm text-slate-500">{productions.length} عملية إنتاج مسجّلة</p>
        </div>
        {canRecord && (
          <Button onClick={openAdd}><Plus size={16} /> تسجيل إنتاج</Button>
        )}
      </div>

      <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
        <FlaskConical size={15} className="shrink-0 mt-0.5" />
        <p>
          تسجيل الإنتاج يخصم المواد الخام من المخزون ويضيف الصنف الجاهز إليه
          <b> بتكلفة مدخلاته</b> — فيصير متوسط سعره صادقاً، ومنه تُحسب تكلفة أصناف الأكل المرتبطة به.
        </p>
      </div>

      {allRecipeItems.length > 0 && (
        <Card className="p-0 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowRecipes((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3.5 text-right hover:bg-slate-100 transition-colors"
          >
            <FlaskConical size={16} className="text-slate-500 shrink-0" />
            <span className="font-bold text-slate-700 text-sm">المنتجات والوصفات القياسية</span>
            <span className="text-xs text-slate-500">
              {allRecipeItems.length} منتج —{" "}
              <b className={readyCount > 0 ? "text-slate-700" : "text-slate-500"}>{readyCount} قابل للإنتاج الآن</b>
              {needsRecipeCount > 0 && <b className="text-red-600"> · {needsRecipeCount} يحتاج خلطة</b>}
            </span>
            <span className="mr-auto text-slate-400 text-xs">{showRecipes ? "إخفاء" : "عرض"}</span>
          </button>

          {showRecipes && (
            <div className="border-t border-slate-200">
              <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="max-w-xs flex-1">
                  <SearchBox value={recipeSearch} onChange={setRecipeSearch} placeholder="ابحث عن خلطة أو منتج..." />
                </div>
                <select value={recipeStatusFilter} onChange={(e) => setRecipeStatusFilter(e.target.value as "" | "ready" | "short" | "missing" | "raw" | "sale")}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1C2D50]">
                  <option value="">كل الحالات</option>
                  <option value="ready">جاهز للإنتاج</option>
                  <option value="short">غير متوفر</option>
                  <option value="missing">يحتاج خلطة</option>
                  <option value="raw">مادة خام</option>
                  <option value="sale">منتج بيع مباشر</option>
                </select>
                <ClearFiltersButton show={!!recipeStatusFilter} onClear={() => setRecipeStatusFilter("")} />
              </div>
              {recipeItems.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">لا توجد نتائج مطابقة</p>
              ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2.5"><SortHeader label="المنتج" sortKeyName="name" activeKey={recipeSortKey} dir={recipeSortDir} onSort={toggleRecipeSort} /></th>
                      <th className="px-4 py-2.5 font-semibold">النوع</th>
                      <th className="px-4 py-2.5 font-semibold">القسم</th>
                      <th className="px-4 py-2.5 font-semibold">الوحدة</th>
                      <th className="px-4 py-2.5 font-semibold">الرصيد</th>
                      <th className="px-4 py-2.5 font-semibold">الحد الأدنى</th>
                      {fp.inputs && <th className="px-4 py-2.5 font-semibold">الوصفة</th>}
                      <th className="px-4 py-2.5"><SortHeader label="الحالة" sortKeyName="status" activeKey={recipeSortKey} dir={recipeSortDir} onSort={toggleRecipeSort} /></th>
                      <th className="px-4 py-2.5 font-semibold">الباركود</th>
                      <th className="px-4 py-2.5 font-semibold">عمليات الإنتاج</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="px-2 py-2"><input value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} placeholder="بحث..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-[11px]" /></td>
                      <td className="px-2 py-2"><select value={recipeTypeFilter} onChange={(e) => setRecipeTypeFilter(e.target.value)} className="w-full rounded-md border border-slate-200 px-1 py-1 text-[11px] bg-white"><option value="">الكل</option><option value="raw">مادة خام</option><option value="produced">منتج مُصنَّع</option><option value="sale">منتج بيع</option></select></td>
                      <td className="px-2 py-2"><select value={recipeSectionFilter} onChange={(e) => setRecipeSectionFilter(e.target.value)} className="w-full rounded-md border border-slate-200 px-1 py-1 text-[11px] bg-white"><option value="">الكل</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></td>
                      <td className="px-2 py-2"><select value={recipeUnitFilter} onChange={(e) => setRecipeUnitFilter(e.target.value)} className="w-full rounded-md border border-slate-200 px-1 py-1 text-[11px] bg-white"><option value="">الكل</option>{recipeUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
                      <td className="px-2 py-2"><input type="number" min="0" value={recipeBalanceFilter} onChange={(e) => setRecipeBalanceFilter(e.target.value)} placeholder="≤ الرصيد" className="w-20 rounded-md border border-slate-200 px-2 py-1 text-[11px]" /></td>
                      <td className="px-2 py-2"><input type="number" min="0" value={recipeMinimumFilter} onChange={(e) => setRecipeMinimumFilter(e.target.value)} placeholder="≥ الحد" className="w-20 rounded-md border border-slate-200 px-2 py-1 text-[11px]" /></td>
                      {fp.inputs && <td className="px-2 py-2"><input value={recipeIngredientFilter} onChange={(e) => setRecipeIngredientFilter(e.target.value)} placeholder="مكوّن..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-[11px]" /></td>}
                      <td className="px-2 py-2"><select value={recipeStatusFilter} onChange={(e) => setRecipeStatusFilter(e.target.value as "" | "ready" | "short" | "missing" | "raw" | "sale")} className="w-full rounded-md border border-slate-200 px-1 py-1 text-[11px] bg-white"><option value="">الكل</option><option value="ready">جاهز</option><option value="short">غير متوفر</option><option value="missing">يحتاج خلطة</option><option value="raw">خام</option><option value="sale">بيع مباشر</option></select></td>
                      <td className="px-2 py-2"><input value={recipeBarcodeFilter} onChange={(e) => setRecipeBarcodeFilter(e.target.value)} placeholder="باركود..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-[11px]" /></td>
                      <td className="px-2 py-2"><select value={recipeOperationFilter} onChange={(e) => setRecipeOperationFilter(e.target.value)} className="w-full rounded-md border border-slate-200 px-1 py-1 text-[11px] bg-white"><option value="">الكل</option><option value="yes">لها عمليات</option><option value="no">بلا عمليات</option></select></td>
                      <td></td>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecipeItems.map(({ item, maxQty, ready, shortageName }) => (
                      <tr key={item.id} className="border-b border-slate-200 last:border-none align-top">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-600">{item.name}</p>
                        </td>
                        <td className="px-4 py-2.5"><select value={item.kind ?? "raw"} onChange={(e) => confirmItemChange(item, "kind", e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="raw">مادة خام</option><option value="produced">منتج مُصنَّع</option><option value="sale">منتج بيع</option></select></td>
                        <td className="px-4 py-2.5"><select value={(item.salesSections ?? [])[0] ?? ""} onChange={(e) => confirmItemChange(item, "salesSections", e.target.value)} className="max-w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="">{item.rawCategory || "بلا قسم"}</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></td>
                        <td className="px-4 py-2.5 text-slate-600">{item.unit}</td>
                        <td className="px-4 py-2.5 font-semibold tabular-nums-auto">{((item.totalIn ?? 0) - (item.totalOut ?? 0)).toLocaleString("en-US")}</td>
                        <td className="px-4 py-2.5"><input type="number" min="0" step="0.01" defaultValue={item.minimumStock ?? 0} onBlur={(e) => saveMinimumStock(item, e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums-auto" /></td>
                        {fp.inputs && (
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {(item.productionRecipe ?? []).length === 0 ? (
                                <span className="text-[11px] text-slate-400">{(item.kind ?? "raw") === "raw" ? "لا تحتاج وصفة" : item.kind === "sale" ? "بيع مباشر" : "لم تُضَف مكوّنات بعد"}</span>
                              ) : (
                                (item.productionRecipe ?? []).map((l) => (
                                  <span key={l.barcode} className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full tabular-nums-auto whitespace-nowrap">
                                    {l.itemName} {(l.qty ?? 0).toLocaleString("en-US")} {l.unit}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-2.5 tabular-nums-auto">
                          {recipeStatus({ item, maxQty, ready, shortageName }) === "raw" ? (
                            <span className="text-slate-500">مادة خام</span>
                          ) : recipeStatus({ item, maxQty, ready, shortageName }) === "sale" ? (
                            <span className="text-amber-700">منتج بيع مباشر</span>
                          ) : (item.productionRecipe ?? []).length === 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-red-600 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                              يحتاج خلطة
                            </span>
                          ) : ready ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                              جاهز — حتى {money(maxQty)} {item.unit}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-slate-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                              {shortageName ? `غير متوفر — ينقص: ${shortageName}` : "غير متوفر"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.id}</td>
                        <td className="px-4 py-2.5 min-w-[190px]">
                          {(() => {
                            const itemProductions = productions.filter((p) => p.outputBarcode === item.id);
                            const latest = itemProductions[0];
                            if (!latest) return <span className="text-xs text-slate-400">لا توجد عملية إنتاج</span>;
                            return (
                              <div className="space-y-1.5">
                                <div className="text-xs text-slate-600 tabular-nums-auto">
                                  <span className="font-semibold text-slate-800">{latest.outputQty.toLocaleString("en-US")} {latest.outputUnit}</span>
                                  <span className="text-slate-400"> · {fmtDate(latest.productionDate)}</span>
                                  {itemProductions.length > 1 && <span className="block text-[10px] text-slate-400">{itemProductions.length} عمليات مسجلة</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  {canLabel && <button onClick={() => setLabelTarget({ id: latest.outputBarcode, name: latest.outputName, productionDate: latest.productionDate, expiryDate: latest.expiryDate ?? null })} className="text-slate-400 hover:text-[#1C2D50]" title="طباعة ملصق آخر دفعة"><Printer size={13} /></button>}
                                  {canEditEntry && <button onClick={() => openEdit(latest)} className="text-slate-400 hover:text-[#1C2D50]" title="تعديل آخر عملية"><Pencil size={13} /></button>}
                                  {canDelete && <button onClick={() => setDeleteTarget(latest)} className="text-slate-400 hover:text-red-500" title="حذف آخر عملية"><Trash2 size={13} /></button>}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5 justify-end">
                            {canRecipe && (item.kind ?? "raw") !== "raw" && (
                              <button
                                onClick={() => openAddWithRecipe(item)}
                                className="text-slate-400 hover:text-[#1C2D50] transition-colors p-1"
                                title="تعديل الوصفة"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {ready && canRecord && (
                              <Button size="sm" variant="secondary" onClick={() => openAddWithRecipe(item)} className="shrink-0">
                                تسجيل
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {recipeItems.length > 0 && <div className="border-t border-slate-100 px-4 py-3"><Pagination page={safeRecipePage} totalPages={recipeTotalPages} onChange={setRecipePage} /></div>}
            </div>
          )}
        </Card>
      )}

      {/* تسجيل إنتاج */}
      <Modal open={showAdd} onClose={closeModal} title={editTarget ? "تعديل عملية إنتاج" : "تسجيل إنتاج"} size="lg">
        <div className="space-y-4">
          {editTarget && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>التعديل يعيد حساب المخزون والتكلفة فوراً. الصنف المُنتَج ثابت لا يتغيّر.</p>
            </div>
          )}
          {/* الصنف المُنتَج */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">الصنف المُنتَج</label>
            {output ? (
              <div className="flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate min-w-0">{output.name}</p>
                    {editTarget ? (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        kindOf(output) === "produced" ? "bg-violet-50 text-violet-700" : kindOf(output) === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                      }`}>
                        {kindOf(output) === "produced" ? "إنتاج" : kindOf(output) === "sale" ? "منتج بيع" : "خام"}
                      </span>
                    ) : (
                      <select
                        value={kindOf(output)}
                        onChange={(e) => quickSetOutputKind(e.target.value as "raw" | "produced" | "sale")}
                        title="نوع الصنف — تصنيف تنظيمي"
                        className={`text-[9px] font-bold pl-1 pr-1.5 py-0.5 rounded-full shrink-0 border-0 outline-none cursor-pointer ${
                          kindOf(output) === "produced" ? "bg-violet-50 text-violet-700" : kindOf(output) === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                        }`}
                      >
                        <option value="raw">خام</option>
                        <option value="produced">إنتاج</option>
                        <option value="sale">منتج بيع</option>
                      </select>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-mono">{output.id}</span> · الوحدة: {output.unit}
                    {output.productionRecipe?.length && !editTarget ? " · عُبّئت خلطته القياسية" : ""}
                  </p>
                </div>
                {!editTarget && (
                  <button type="button" onClick={() => { setOutput(null); setInputs([]); setPickedSections([]); }}
                    className="text-xs text-slate-500 hover:text-red-500 shrink-0">تغيير</button>
                )}
              </div>
            ) : editTarget ? (
              <p className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-xl px-3 py-2">
                الصنف المُنتَج الأصلي لم يعد موجوداً في التكاليف — لا يمكن تعديل هذه العملية من هنا.
              </p>
            ) : (
              <>
                <input type="text" value={outputSearch} onChange={(e) => setOutputSearch(e.target.value)}
                  placeholder="ابحث عن الصنف الجاهز (مثال: بطاطس جاهزة للتشغيل)..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                <div className="mt-1.5 max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                  {outputChoices.length === 0 ? (
                    <p className="text-xs text-slate-400 p-3 text-center">
                      {items.length === 0 ? "لا توجد أصناف مسجّلة بعد" : "لا توجد نتائج مطابقة"}
                    </p>
                  ) : outputChoices.map((i) => (
                    <button key={i.id} type="button" onClick={() => pickOutput(i)}
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          kindOf(i) === "produced" ? "bg-violet-50 text-violet-700" : kindOf(i) === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                        }`}>
                          {kindOf(i) === "produced" ? "إنتاج" : kindOf(i) === "sale" ? "بيع" : "خام"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800 truncate">{i.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{i.id}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{i.unit}</span>
                    </button>
                  ))}
                </div>
                {oq && (
                  <>
                    {/* صنف جديد؟ يُنشأ ويُولَّد باركوده هنا — الإنتاج هو لحظة ميلاده */}
                    <div className="mt-2 border border-dashed border-emerald-300 bg-emerald-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
                        <Barcode size={13} />
                        صنف جديد؟ أنشئه هنا ويُولَّد له باركود داخلي
                      </p>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 min-w-0">
                          <label className="text-[11px] text-slate-500 block mb-1">المنتج</label>
                          <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm truncate">{oq}</div>
                        </div>
                        <div className="w-28 shrink-0">
                          <label className="text-[11px] text-slate-500 block mb-1">الوحدة</label>
                          <select value={newOutputUnit} onChange={(e) => setNewOutputUnit(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                            {units.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <Button type="button" size="sm" variant="success" loading={creatingOutput}
                          onClick={createOutput} disabled={!newOutputUnit}>
                          إنشاء
                        </Button>
                      </div>
                      <div className="mt-2">
                        <label className="text-[11px] text-slate-500 block mb-1">هل هذا الصنف منتج بيع أم إنتاج وسيط؟</label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setNewOutputKind("produced")}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                              newOutputKind === "produced" ? "border-violet-600 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"
                            }`}>
                            إنتاج — يدخل في وصفة صنف آخر
                          </button>
                          <button type="button" onClick={() => setNewOutputKind("sale")}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                              newOutputKind === "sale" ? "border-amber-600 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"
                            }`}>
                            منتج بيع — يُختار للعميل مباشرة
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {output && (
            <>
              <Input label={`الكمية المُنتَجة (${output.unit})`} type="number" min={0} step="0.01" required
                value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />

              {/* قسم البيع — هنا لا في خطوة لاحقة تُنسى، فمنتج بلا قسم
                  لا يظهر عند الصرف ولا عند اختيار أصناف الحفلة.
                  لا تُخزَّن الأقسام على عملية الإنتاج نفسها بل تُتّحد على
                  الصنف مرة عند الإنشاء، فلا سبيل لمعرفة أيّها يخصّ هذه
                  العملية بعينها — ولذلك تُعرض للقراءة فقط عند التعديل. */}
              {editTarget ? (
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">أقسام بيع هذا الصنف حالياً</label>
                  <div className="flex flex-wrap gap-1.5">
                    {sections.filter((s) => output.salesSections?.includes(s.id)).length === 0 ? (
                      <p className="text-xs text-slate-400">لا أقسام مضمومة</p>
                    ) : sections.filter((s) => output.salesSections?.includes(s.id)).map((sec) => (
                      <span key={sec.id} className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {sec.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    تابعة للصنف نفسه لا لهذه العملية — تُضاف بتسجيل إنتاج جديد له
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                    في أي قسم يُباع هذا المنتج؟
                  </label>
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {SALES_CHANNELS.map((c) => {
                      const n = sections.filter(
                        (s) => s.channel === c.key && pickedSections.includes(s.id)
                      ).length;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setSectionChannel(c.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            sectionChannel === c.key
                              ? "bg-[#1C2D50] text-white"
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {c.label}
                          {n > 0 && (
                            <span className={`ms-1.5 tabular-nums-auto ${sectionChannel === c.key ? "text-white/70" : "text-[#1C2D50]"}`}>
                              {n}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {(() => {
                    const chanSections = sections.filter((s) => s.channel === sectionChannel);
                    if (chanSections.length === 0) {
                      return (
                        <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl px-3 py-2.5">
                          لا أقسام في هذه القناة — أنشئها من صفحة منتجات البيع
                        </p>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {chanSections.map((sec) => {
                          const on = pickedSections.includes(sec.id);
                          return (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => setPickedSections((prev) =>
                                on ? prev.filter((x) => x !== sec.id) : [...prev, sec.id]
                              )}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                on
                                  ? "bg-[#EEF1F7] text-[#1C2D50] border border-[#1C2D50]"
                                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {on && "✓ "}{sec.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {pickedSections.length === 0
                      ? "إلزامي — بدونه لن يظهر المنتج عند الصرف"
                      : `مضموم إلى ${pickedSections.length} قسم · يجوز في أكثر من قناة`}
                  </p>
                </div>
              )}

              {/* المدخلات */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">المواد الخام المستهلكة</label>
                {inputs.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-2">لم تُضَف مواد بعد</p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {inputs.map((l, idx) => {
                      const bal = availableFor(l.barcode);
                      const n = parseFloat(l.qty) || 0;
                      const short = n > bal;
                      const unitPrice = avgCostFor(l.barcode);
                      return (
                        <div key={l.barcode}
                          className={`flex items-center gap-2 flex-wrap border rounded-xl px-3 py-2 ${short ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                          <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{l.itemName}</span>
                          <input type="number" min={0} step="0.001" value={l.qty}
                            onChange={(e) => setInputs((prev) => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                            placeholder="0"
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                          <span className="text-xs text-slate-500 shrink-0 w-10">{l.unit}</span>
                          <span className="text-[10px] font-semibold text-[#1C2D50] shrink-0 tabular-nums-auto whitespace-nowrap" title={`${money(unitPrice)} ريال لكل ${l.unit}`}>
                            {money(r2(unitPrice * n))} ريال
                          </span>
                          <span className={`text-[10px] shrink-0 tabular-nums-auto ${short ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                            {short ? `المتوفر ${bal}` : `متوفر ${bal}`}
                          </span>
                          <button type="button" onClick={() => setInputs((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <input type="text" value={inputSearch} onChange={(e) => setInputSearch(e.target.value)}
                  placeholder="أضف مادة خام..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                <div className="mt-1.5 max-h-44 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
                  {inputChoices.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2.5 text-center">
                      {available.length === 0 ? "لا توجد أصناف أخرى متاحة" : "لا توجد نتائج مطابقة"}
                    </p>
                  ) : inputChoices.map((i) => {
                    const bal = availableFor(i.id);
                    const unitPrice = avgCostFor(i.id);
                    return (
                      <button key={i.id} type="button" onClick={() => addInput(i)}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            kindOf(i) === "produced" ? "bg-violet-50 text-violet-700" : kindOf(i) === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                          }`}>
                            {kindOf(i) === "produced" ? "إنتاج" : kindOf(i) === "sale" ? "بيع" : "خام"}
                          </span>
                          <span className="truncate">{i.name}</span>
                        </span>
                        <span className="text-[10px] shrink-0 tabular-nums-auto text-left leading-tight">
                          <span className="block font-semibold text-[#1C2D50]">{money(unitPrice)} ريال / {i.unit}</span>
                          <span className={bal <= 0 ? "text-red-600 font-semibold" : "text-slate-400"}>
                            متوفر {bal.toLocaleString("en-US")} {i.unit}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {iq && (
                  <div className="mt-2 border border-dashed border-emerald-300 bg-emerald-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
                      <Barcode size={13} />
                      مادة خام جديدة؟ أنشئها هنا ويُولَّد لها باركود داخلي
                    </p>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <label className="text-[11px] text-slate-500 block mb-1">المادة الخام</label>
                        <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm truncate">{iq}</div>
                      </div>
                      <div className="w-28 shrink-0">
                        <label className="text-[11px] text-slate-500 block mb-1">الوحدة</label>
                        <select value={newInputUnit} onChange={(e) => setNewInputUnit(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                          <option value="" disabled>اختر</option>
                          {units.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <Button type="button" size="sm" variant="success" loading={creatingInput}
                        onClick={createInput} disabled={!newInputUnit}>
                        إنشاء
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {shortages.length > 0 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p>الكمية غير كافية من: {shortages.map((s) => s.itemName).join("، ")}</p>
                </div>
              )}

              {parsedInputs.length > 0 && (
                <div className="bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-[#1C2D50]">تكلفة الإنتاج</span>
                    <span className="font-bold text-[#1C2D50] tabular-nums-auto">
                      {money(estimatedCost)} ريال
                      {outQty > 0 && <span className="text-xs font-normal"> · {money(unitCost)} لكل {output.unit}</span>}
                    </span>
                  </div>
                  {estimatedCost === 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      صفر — لم يُسجَّل وارد (شراء) لهذه المواد بعد، فلا متوسط سعر تُحسب منه التكلفة.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label="تاريخ الإنتاج (من)" type="date" required value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
                <Input label="تاريخ الانتهاء (إلى)" type="date" value={expiryDate} min={prodDate || undefined}
                  onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">التاريخان يُطبعان على ملصق باركود هذه الدفعة.</p>
              <Input label="ملاحظة (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div className="flex gap-2 justify-between items-center pt-1">
                {editTarget || !canRecipe ? <span /> : (
                  <button type="button" onClick={handleSaveRecipe}
                    disabled={saving || parsedInputs.length === 0 || outQty <= 0}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] disabled:opacity-40">
                    <Save size={13} /> حفظ كخلطة قياسية لهذا الصنف
                  </button>
                )}
                <div className="flex gap-3">
                  <Button variant="secondary" type="button" onClick={closeModal}>إلغاء</Button>
                  <Button onClick={handleSave} loading={saving} disabled={shortages.length > 0}>
                    {editTarget ? "حفظ التعديل" : "تسجيل الإنتاج"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ملصق باركود المُنتَج — يُلصق على الخلطة بعد تجهيزها */}
      <BarcodeLabelModal open={!!labelTarget} onClose={() => setLabelTarget(null)} item={labelTarget} />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف عملية الإنتاج"
        message={`سيُخصم ${deleteTarget?.outputQty} ${deleteTarget?.outputUnit} من "${deleteTarget?.outputName}" وتُعاد المواد الخام لمخزونها. متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}

export default function CostsProductionPage() {
  return (
    <FeatureGate feature="production" name="الإنتاج">
      <CostsProductionPageInner />
    </FeatureGate>
  );
}
