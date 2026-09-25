"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader, PageShell, LoadingState } from "@/components/ui/page";
import { SearchBox } from "@/components/ui/list-filters";
import {
  createCostItemGenerated,
  getCostIncoming,
  getCostItems,
  getCostOutgoing,
  getCostProductions,
  getCostSettings,
  updateCostItem,
  updateCostSettings,
} from "@/lib/firestore/costs";
import { CostIncoming, CostItem, CostOutgoing, CostProduction, CostSettings } from "@/types";
import { FolderPlus, History, Package, PackagePlus, Plus } from "lucide-react";

type Movement = { id: string; date: string; kind: string; quantity: number; note: string };
const emptyItem = { name: "", unit: "", category: "" };

export default function RawMaterialsPage() {
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const canAddItem = isAdmin || feat("costs", "item_add");
  const canEditItem = isAdmin || feat("costs", "item_edit");
  const canConfig = isAdmin || feat("costs", "item_config");
  const canIncoming = isAdmin || feat("costs", "in_add");

  const [items, setItems] = useState<CostItem[]>([]);
  const [incoming, setIncoming] = useState<CostIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [productions, setProductions] = useState<CostProduction[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [], rawCategories: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCategory, setShowCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [showItem, setShowItem] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementItem, setMovementItem] = useState<CostItem | null>(null);

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

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    setSaving(true);
    try {
      await createCostItemGenerated({
        name: itemForm.name.trim(), unit: itemForm.unit, createdBy: appUser.uid,
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
          {canConfig && <Button variant="outline" onClick={() => setShowCategory(true)}><FolderPlus size={16} /> إضافة قسم</Button>}
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
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">{group.name}</h2><span className="text-xs text-slate-400">{group.items.length} مادة</span></div>
          {group.items.length === 0 ? <Card className="py-8 text-center text-sm text-slate-400">القسم فارغ — أضف مادة خام إليه</Card> : (
            <div className="data-table-shell"><table className="data-table"><thead><tr>
              <th>المادة</th><th>النوع</th><th>القسم</th><th>الموردون</th><th>الوحدة</th><th>الرصيد</th><th>الحد الأدنى</th><th>متوسط التكلفة</th><th>قيمة الرصيد</th><th>آخر وارد</th><th></th>
            </tr></thead><tbody>{group.items.map((item) => {
              const bal = (item.totalIn ?? 0) - (item.totalOut ?? 0);
              const avg = bal > 0 ? (item.totalInValue ?? 0) / bal : 0;
              const last = incoming.find((e) => e.itemBarcode === item.id);
              const suppliers = [...new Set(incoming.filter((e) => e.itemBarcode === item.id && e.supplierName).map((e) => e.supplierName))];
              return <tr key={item.id}>
                <td><p className="font-semibold text-slate-800">{item.name}</p><p className="text-[11px] text-slate-400 font-mono">{item.id}</p></td>
                <td><select value={item.kind ?? "raw"} onChange={(e) => changeKind(item, e.target.value as "raw" | "produced" | "sale")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="raw">مادة خام</option><option value="produced">منتج مُصنَّع</option><option value="sale">منتج بيع</option></select></td>
                <td>{canEditItem ? <select value={item.rawCategory ?? ""} onChange={(e) => changeCategory(item, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="">غير مصنّف</option>{categories.map((c) => <option key={c}>{c}</option>)}</select> : (item.rawCategory ?? "غير مصنّف")}</td>
                <td>{suppliers.length ? <div className="flex flex-wrap gap-1">{suppliers.map((supplier) => <span key={supplier} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{supplier}</span>)}</div> : <span className="text-slate-400">—</span>}</td>
                <td>{item.unit}</td><td className={`font-semibold tabular-nums-auto ${(item.minimumStock ?? 0) > 0 && bal <= (item.minimumStock ?? 0) ? "text-red-600" : ""}`}>{bal.toLocaleString("en-US")}</td>
                <td><input type="number" min="0" step="0.01" defaultValue={item.minimumStock ?? 0} onBlur={(e) => saveMinimumStock(item, e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs" /></td>
                <td className="tabular-nums-auto">{avg.toLocaleString("en-US", { maximumFractionDigits: 2 })} ريال</td>
                <td className="tabular-nums-auto">{(item.totalInValue ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ريال</td>
                <td className="text-slate-500 tabular-nums-auto">{last?.invoiceDate ?? "—"}</td>
                <td><div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setMovementItem(item)}><History size={14} /> عرض الحركة</Button>
                </div></td>
              </tr>;
            })}</tbody></table></div>
          )}
        </section>
      ))}

      <Modal open={showCategory} onClose={() => setShowCategory(false)} title="إضافة قسم للمواد الخام">
        <div className="space-y-4"><Input label="اسم القسم" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="مثال: اللحوم" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowCategory(false)}>إلغاء</Button><Button onClick={addCategory} loading={saving}>إضافة القسم</Button></div></div>
      </Modal>

      <Modal open={showItem} onClose={() => setShowItem(false)} title="إضافة مادة خام">
        <form onSubmit={addItem} className="space-y-4">
          <Input label="اسم المادة" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
          <Select label="الوحدة" required value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}><option value="" disabled>اختر الوحدة</option>{settings.units.map((u) => <option key={u}>{u}</option>)}</Select>
          <Select label="القسم" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}><option value="">غير مصنّف</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setShowItem(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ المادة</Button></div>
        </form>
      </Modal>

      <Modal open={!!movementItem} onClose={() => setMovementItem(null)} title={`حركة المادة — ${movementItem?.name ?? ""}`} size="lg">
        {movementItem && <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">الحد الأدنى:</span> <strong className="mr-1 tabular-nums-auto">{(movementItem.minimumStock ?? 0).toLocaleString("en-US")} {movementItem.unit}</strong></div>}
        {movements.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد حركة مسجلة لهذه المادة</p> : <div className="data-table-shell"><table className="data-table"><thead><tr><th>التاريخ</th><th>الحركة</th><th>الكمية</th><th>البيان</th></tr></thead><tbody>{movements.map((m) => <tr key={m.id}><td>{m.date}</td><td>{m.kind}</td><td className={m.quantity >= 0 ? "text-emerald-700" : "text-red-700"}>{m.quantity > 0 ? "+" : ""}{m.quantity.toLocaleString("en-US")}</td><td>{m.note}</td></tr>)}</tbody></table></div>}
      </Modal>
    </PageShell>
  );
}
