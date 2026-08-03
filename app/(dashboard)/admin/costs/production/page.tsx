"use client";

import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/ui/feature-gate";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCostItems, getCostProductions, addCostProduction, deleteCostProduction, updateProductionRecipe,
  createCostItemGenerated, getCostSettings,
} from "@/lib/firestore/costs";
import { BarcodeLabelModal } from "@/components/ui/barcode-label-modal";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { CostItem, CostProduction, RecipeLine } from "@/types";
import { averageCost, itemBalance } from "@/lib/recipes";
import { Plus, FlaskConical, Trash2, X, Save, AlertTriangle, Barcode, Printer } from "lucide-react";

const PAGE_SIZE = 10;

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
  const canRecord = isAdmin || feat("costs", "record_incoming");

  const [items, setItems] = useState<CostItem[]>([]);
  const [productions, setProductions] = useState<CostProduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CostProduction | null>(null);
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
  const [labelTarget, setLabelTarget] = useState<
    { id: string; name: string; productionDate?: string | null; expiryDate?: string | null } | null
  >(null);
  const [notes, setNotes] = useState("");

  useEffect(() => { setPage(1); }, [search, dateF]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [i, p, st] = await Promise.all([
      getCostItems(),
      getCostProductions().catch(() => [] as CostProduction[]),
      getCostSettings().catch(() => ({ units: [], departments: [] })),
    ]);
    setItems(i);
    setProductions(p);
    setUnits(st.units);
    setLoading(false);
  }

  function openAdd() {
    setOutput(null); setOutputSearch(""); setOutputQty("");
    setInputs([]); setInputSearch("");
    setProdDate(new Date().toISOString().slice(0, 10));
    setExpiryDate("");
    setNewOutputUnit(units[0] ?? "");
    setNotes("");
    setShowAdd(true);
  }

  /* اختيار المُنتَج يُعبّئ خلطته القياسية إن وُجدت */
  function pickOutput(item: CostItem) {
    setOutput(item);
    setOutputSearch("");
    // مدة صلاحية آخر دفعة تُطبَّق على هذه الدفعة ابتداءً من تاريخ إنتاجها
    const days = shelfLifeDays(item);
    setExpiryDate(days != null && prodDate ? addDays(prodDate, days) : "");
    if (item.productionRecipe?.length) {
      setInputs(item.productionRecipe.map((l) => ({
        barcode: l.barcode, itemName: l.itemName, unit: l.unit, qty: String(l.qty),
      })));
      if (!outputQty) setOutputQty(String(item.productionRecipe[0].perQty || 1));
    } else {
      setInputs([]);
    }
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
        createdBy: appUser.uid,
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

  function addInput(item: CostItem) {
    if (inputs.some((l) => l.barcode === item.id)) return;
    setInputs((prev) => [...prev, { barcode: item.id, itemName: item.name, unit: item.unit, qty: "" }]);
    setInputSearch("");
  }

  const parsedInputs = inputs
    .map((l) => ({ ...l, n: parseFloat(l.qty) || 0 }))
    .filter((l) => l.n > 0);

  const estimatedCost = parsedInputs.reduce((s, l) => {
    const it = items.find((i) => i.id === l.barcode);
    return s + averageCost(it) * l.n;
  }, 0);
  const outQty = parseFloat(outputQty) || 0;
  const unitCost = outQty > 0 ? estimatedCost / outQty : 0;

  const shortages = parsedInputs.filter((l) => {
    const it = items.find((i) => i.id === l.barcode);
    return l.n > itemBalance(it);
  });

  async function handleSave() {
    if (!appUser || !output) return;
    if (outQty <= 0) { showToast("أدخل كمية الإنتاج", "error"); return; }
    if (parsedInputs.length === 0) { showToast("أضف مادة خام واحدة على الأقل بكمية", "error"); return; }
    if (expiryDate && prodDate && expiryDate < prodDate) {
      showToast("تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج", "error");
      return;
    }
    setSaving(true);
    try {
      await addCostProduction({
        outputBarcode: output.id,
        outputQty: outQty,
        inputs: parsedInputs.map((l) => ({ barcode: l.barcode, qty: l.n })),
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

  const q = search.trim();
  const filtered = productions
    .filter((p) => matchesDate(p.productionDate ?? p.createdAt, dateF))
    .filter((p) => !q || p.outputName.includes(q) || p.inputs.some((i) => i.itemName.includes(q)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // القائمتان تعرضان كل الأصناف افتراضياً، والبحث يضيّقها — لا يُشترط
  // أن يتذكّر المستخدم الاسم قبل أن يرى ما لديه
  const oq = outputSearch.trim();
  const outputChoices = oq ? items.filter((i) => i.name.includes(oq) || i.id.includes(oq)) : items;
  const iq = inputSearch.trim();
  const available = items.filter((i) => i.id !== output?.id && !inputs.some((l) => l.barcode === i.id));
  const inputChoices = iq ? available.filter((i) => i.name.includes(iq) || i.id.includes(iq)) : available;

  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">الإنتاج (الخلطات)</h2>
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

      <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف المُنتَج أو المواد الخام..." />
      <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بتاريخ الإنتاج" matchedCount={filtered.length} unitLabel="عملية" />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <FlaskConical size={40} className="mb-3 opacity-40" />
          <p>لا توجد عمليات إنتاج مطابقة</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginated.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800">
                    {p.outputName}
                    <span className="text-sm font-normal text-slate-500 mr-2 tabular-nums-auto">
                      {p.outputQty.toLocaleString("en-US")} {p.outputUnit}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums-auto">
                    {fmtDate(p.productionDate)}
                    {p.expiryDate && <span className="text-amber-600"> ← {fmtDate(p.expiryDate)}</span>}
                    {" · "}تكلفة الوحدة {money(p.unitCost)} ريال
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-[#1C2D50] tabular-nums-auto">{money(p.totalCost)} ريال</span>
                  {/* إعادة طباعة ملصق هذه الدفعة بتاريخيها هي، لا بتاريخ آخر دفعة */}
                  <button
                    onClick={() => setLabelTarget({
                      id: p.outputBarcode, name: p.outputName,
                      productionDate: p.productionDate, expiryDate: p.expiryDate ?? null,
                    })}
                    className="text-slate-400 hover:text-[#1C2D50] transition-colors"
                    title="طباعة ملصق هذه الدفعة"
                  >
                    <Printer size={14} />
                  </button>
                  {isAdmin && (
                    <button onClick={() => setDeleteTarget(p)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                {p.inputs.map((i) => (
                  <span key={i.barcode} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full tabular-nums-auto">
                    {i.itemName} {i.qty.toLocaleString("en-US")} {i.unit}
                  </span>
                ))}
              </div>
              {p.notes && <p className="text-xs text-slate-400 mt-2">{p.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

      {/* تسجيل إنتاج */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="تسجيل إنتاج" size="lg">
        <div className="space-y-4">
          {/* الصنف المُنتَج */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">الصنف المُنتَج</label>
            {output ? (
              <div className="flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{output.name}</p>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-mono">{output.id}</span> · الوحدة: {output.unit}
                    {output.productionRecipe?.length ? " · عُبّئت خلطته القياسية" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => { setOutput(null); setInputs([]); }}
                  className="text-xs text-slate-500 hover:text-red-500 shrink-0">تغيير</button>
              </div>
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
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{i.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{i.id}</p>
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
                          <label className="text-[11px] text-slate-500 block mb-1">الاسم</label>
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

              {/* المدخلات */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">المواد الخام المستهلكة</label>
                {inputs.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-2">لم تُضَف مواد بعد</p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {inputs.map((l, idx) => {
                      const it = items.find((i) => i.id === l.barcode);
                      const bal = itemBalance(it);
                      const n = parseFloat(l.qty) || 0;
                      const short = n > bal;
                      return (
                        <div key={l.barcode}
                          className={`flex items-center gap-2 border rounded-xl px-3 py-2 ${short ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                          <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{l.itemName}</span>
                          <input type="number" min={0} step="0.001" value={l.qty}
                            onChange={(e) => setInputs((prev) => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                            placeholder="0"
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center tabular-nums-auto" />
                          <span className="text-xs text-slate-500 shrink-0 w-10">{l.unit}</span>
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
                    const bal = itemBalance(i);
                    return (
                      <button key={i.id} type="button" onClick={() => addInput(i)}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="truncate">{i.name}</span>
                        <span className={`text-[10px] shrink-0 tabular-nums-auto ${bal <= 0 ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                          متوفر {bal.toLocaleString("en-US")} {i.unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {shortages.length > 0 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p>الكمية غير كافية من: {shortages.map((s) => s.itemName).join("، ")}</p>
                </div>
              )}

              {estimatedCost > 0 && (
                <div className="flex justify-between px-3 py-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl text-sm">
                  <span className="font-semibold text-[#1C2D50]">تكلفة الإنتاج</span>
                  <span className="font-bold text-[#1C2D50] tabular-nums-auto">
                    {money(estimatedCost)} ريال
                    {outQty > 0 && <span className="text-xs font-normal"> · {money(unitCost)} لكل {output.unit}</span>}
                  </span>
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
                <button type="button" onClick={handleSaveRecipe}
                  disabled={saving || parsedInputs.length === 0 || outQty <= 0}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] disabled:opacity-40">
                  <Save size={13} /> حفظ كخلطة قياسية لهذا الصنف
                </button>
                <div className="flex gap-3">
                  <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
                  <Button onClick={handleSave} loading={saving} disabled={shortages.length > 0}>تسجيل الإنتاج</Button>
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
