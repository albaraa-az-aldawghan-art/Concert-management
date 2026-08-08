"use client";

/* منتجات البيع: قنوات البيع الثلاث، وأقسام كل قناة، والأصناف المعروضة
   تحت كل قسم — ومصدرها كلها أصناف التكاليف (خام أو مُنتَج). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { getCostItems } from "@/lib/firestore/costs";
import {
  getSalesSections, addSalesSection, renameSalesSection, deleteSalesSection,
  setItemSections, itemsOfSection,
} from "@/lib/firestore/sales";
import { itemBalance, averageCost } from "@/lib/recipes";
import { CostItem, SalesSection, SalesChannel, SALES_CHANNELS } from "@/types";
import {
  Plus, Trash2, Pencil, X, Search, Package, FlaskConical, Layers,
  ChevronLeft, Barcode, Check, Info,
} from "lucide-react";

export default function SalesProductsPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  // الهيكل مملوك للتكاليف — من يدير أصنافها يدير أقسام بيعها
  const canView = isAdmin || can("food");
  const canAddSection = isAdmin || feat("food", "add");
  const canRename = isAdmin || feat("food", "rename");
  const canDeleteSection = isAdmin || feat("food", "delete");
  const canReorder = isAdmin || feat("food", "reorder");
  const canAssign = isAdmin || feat("food", "assign");
  const canManage = canRename || canAssign;

  const [sections, setSections] = useState<SalesSection[]>([]);
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState<SalesChannel>("concerts");

  const [newSection, setNewSection] = useState("");
  const [renameTarget, setRenameTarget] = useState<SalesSection | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SalesSection | null>(null);

  /* نافذة اختيار أصناف القسم */
  const [pickFor, setPickFor] = useState<SalesSection | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  const [pickKind, setPickKind] = useState<"all" | "produced" | "raw">("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [s, i] = await Promise.all([
      getSalesSections().catch(() => [] as SalesSection[]),
      getCostItems().catch(() => [] as CostItem[]),
    ]);
    setSections(s);
    setItems(i);
    setLoading(false);
  }

  const channelSections = sections.filter((s) => s.channel === channel);

  async function handleAddSection() {
    const name = newSection.trim();
    if (!name) return;
    setSaving(true);
    try {
      await addSalesSection(channel, name);
      setNewSection("");
      showToast("أُضيف القسم");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameValue.trim()) return;
    setSaving(true);
    try {
      await renameSalesSection(renameTarget.id, renameValue.trim());
      showToast("عُدّل الاسم");
      setRenameTarget(null);
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
      const { detached } = await deleteSalesSection(deleteTarget.id);
      showToast(detached > 0 ? `حُذف القسم وأُخرج منه ${detached} صنفاً` : "حُذف القسم");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  /** ضمّ صنف للقسم أو إخراجه منه — القائمة تُستبدل كاملة على الخادم */
  async function toggleItemInSection(item: CostItem, section: SalesSection) {
    const current = item.salesSections ?? [];
    const next = current.includes(section.id)
      ? current.filter((s) => s !== section.id)
      : [...current, section.id];
    // تحديث متفائل: القائمة طويلة والانتظار عند كل ضغطة يُبطئ العمل
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, salesSections: next } : i)));
    try {
      await setItemSections(item.id, next);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر الحفظ", "error");
      load();
    }
  }

  if (appUser && !isAdmin && !canView && !canAddSection && !canRename) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = pickSearch.trim();
  const pickChoices = items
    .filter((i) => (pickKind === "all" ? true : pickKind === "produced" ? !!i.productionRecipe?.length : !i.productionRecipe?.length))
    .filter((i) => !q || i.name.includes(q) || i.id.includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Layers size={20} className="text-[#1C2D50]" />
          منتجات البيع
        </h2>
        <p className="text-sm text-slate-500">
          الطبقة الثالثة من التكاليف: بعد المواد الأولية والتصنيع، هنا تُعرض الأصناف للبيع
        </p>
      </div>

      {/* شرح الهيكل */}
      <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          <strong>١. المواد الأولية</strong> تُشترى في <Link href="/admin/costs/incoming" className="underline">الوارد</Link> ·
          <strong> ٢. التصنيع</strong> يدمجها في <Link href="/admin/costs/production" className="underline">الإنتاج</Link> ·
          <strong> ٣. منتجات البيع</strong> هنا: تختار لكل قسم أصنافه من التكاليف — خاماً كان أو مُنتَجاً.
          ولا يظهر في الحفلات إلا ما اخترته هنا تحت «مبيعات الحفلات».
        </p>
      </div>

      {/* قنوات البيع */}
      <div className="flex gap-2 flex-wrap">
        {SALES_CHANNELS.map((c) => {
          const count = sections.filter((s) => s.channel === c.key).length;
          return (
            <button key={c.key} onClick={() => setChannel(c.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                channel === c.key ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}>
              {c.label}
              <span className={`text-[10px] px-1.5 rounded-full tabular-nums-auto ${
                channel === c.key ? "bg-white/20" : "bg-slate-100 text-slate-500"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* إضافة قسم */}
      {canManage && (
        <div className="flex gap-2">
          <input type="text" value={newSection} onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSection(); } }}
            placeholder={`اسم قسم جديد في ${SALES_CHANNELS.find((c) => c.key === channel)?.label}...`}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
          <Button onClick={handleAddSection} loading={saving} disabled={!newSection.trim()}>
            <Plus size={16} /> إضافة قسم
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : channelSections.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Layers size={40} className="mb-3 opacity-40" />
          <p>لا توجد أقسام في هذه القناة</p>
          <p className="text-xs mt-1">أضف قسماً أولاً (مثل: المشاوي · المعجنات · المقبلات)</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {channelSections.map((section) => {
            const secItems = itemsOfSection(items, section.id);
            return (
              <Card key={section.id}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{section.name}</p>
                    <p className="text-xs text-slate-500">{secItems.length} صنف معروض</p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setRenameTarget(section); setRenameValue(section.name); }}
                        className="p-1.5 text-slate-400 hover:text-[#1C2D50] transition-colors" title="تعديل الاسم">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget(section)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="حذف القسم">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {secItems.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-3">لا توجد أصناف — أضِفها من التكاليف</p>
                ) : (
                  <div className="space-y-1 mb-3 max-h-52 overflow-y-auto">
                    {secItems.map((i) => (
                      <div key={i.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                        <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{i.name}</span>
                        {i.productionRecipe?.length ? (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            إنتاج
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            خام
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 tabular-nums-auto shrink-0">
                          {itemBalance(i).toLocaleString("en-US")} {i.unit}
                        </span>
                        {canManage && (
                          <button onClick={() => toggleItemInSection(i, section)}
                            className="text-slate-300 hover:text-red-500 transition-colors shrink-0" title="إخراج من القسم">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canManage && (
                  <Button variant="outline" size="sm" className="w-full justify-center"
                    onClick={() => { setPickFor(section); setPickSearch(""); setPickKind("all"); }}>
                    <Plus size={14} /> اختيار أصناف من التكاليف
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* اختيار أصناف القسم */}
      <Modal open={!!pickFor} onClose={() => setPickFor(null)}
        title={pickFor ? `أصناف قسم: ${pickFor.name}` : ""} size="lg">
        {pickFor && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 text-xs text-[#1C2D50] leading-relaxed">
              <Info size={14} className="shrink-0 mt-0.5" />
              <p>
                الأصناف مصدرها التكاليف وحدها. الصنف الواحد يظهر في أكثر من قسم وقناة
                بنفس الباركود والتكلفة — فلا يُنتَج مرتين.
              </p>
            </div>

            <div className="flex gap-2">
              {([
                { k: "all", l: "الكل" },
                { k: "produced", l: "المُنتَجة" },
                { k: "raw", l: "الخام" },
              ] as const).map((t) => (
                <button key={t.k} onClick={() => setPickKind(t.k)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    pickKind === t.k ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600"
                  }`}>
                  {t.l}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الباركود..." autoFocus
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {pickChoices.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">
                  {items.length === 0
                    ? "لا توجد أصناف في التكاليف — سجّلها أو أنتجها أولاً"
                    : "لا توجد نتائج مطابقة"}
                </p>
              ) : pickChoices.map((i) => {
                const inSection = (i.salesSections ?? []).includes(pickFor.id);
                const otherCount = (i.salesSections ?? []).filter((s) => s !== pickFor.id).length;
                return (
                  <button key={i.id} type="button" onClick={() => toggleItemInSection(i, pickFor)}
                    className="w-full text-right px-3 py-2.5 hover:bg-slate-50 flex items-center gap-2.5">
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      inSection ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300"
                    }`}>
                      {inSection && <Check size={11} className="text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate flex items-center gap-1.5">
                        {i.name}
                        {i.productionRecipe?.length ? (
                          <FlaskConical size={11} className="text-emerald-600 shrink-0" />
                        ) : (
                          <Package size={11} className="text-slate-400 shrink-0" />
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Barcode size={9} /> {i.id}
                        {otherCount > 0 && <span className="text-slate-400"> · في {otherCount} قسم آخر</span>}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums-auto shrink-0">
                      {itemBalance(i).toLocaleString("en-US")} {i.unit}
                      {averageCost(i) > 0 && (
                        <span className="block text-[10px] text-slate-400">
                          {averageCost(i).toFixed(2)} ريال
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-1">
              <Link href="/admin/costs" className="text-xs font-semibold text-[#1C2D50] hover:underline flex items-center gap-1">
                إدارة أصناف التكاليف <ChevronLeft size={12} />
              </Link>
              <Button variant="secondary" onClick={() => { setPickFor(null); load(); }}>تم</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* تعديل اسم القسم */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="تعديل اسم القسم" size="sm">
        <div className="space-y-4">
          <Input label="الاسم الجديد" value={renameValue} autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(); } }} />
          <p className="text-xs text-slate-500">أصناف القسم لا تتأثر — الربط بالمعرّف لا بالاسم.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>إلغاء</Button>
            <Button onClick={handleRename} loading={saving} disabled={!renameValue.trim()}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف قسم البيع"
        message={`سيُحذف قسم «${deleteTarget?.name}» وتُخرَج أصنافه منه. الأصناف نفسها وأرصدتها لا تُحذف. متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
