"use client";

/* مركز التحكم: الإعدادات الموحّدة وتشغيل الميزات وصحة النظام والمسمّيات — للمدير. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useSystem } from "@/contexts/SystemContext";
import { updateIdleMonths } from "@/lib/firestore/system";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSystemSettings, updateSystemFeatures, updateSystemLabels,
  SystemFeatures, SystemLabels, FEATURE_META, DEFAULT_FEATURES, DEFAULT_LABELS,
} from "@/lib/firestore/system";
import { getVatRate, updateVatRate } from "@/lib/firestore/settings";
import { getCostSettings, updateCostSettings, getCostItems } from "@/lib/firestore/costs";
import { getExpenseSettings, updateExpenseSettings } from "@/lib/firestore/expenses";
import { getConcerts } from "@/lib/firestore/concerts";
import { getCostOutgoing } from "@/lib/firestore/costs";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getFoodCategories, getAllConcertFood } from "@/lib/firestore/food";
import { normalizeStatus } from "@/lib/concert-status";
import { itemBalance } from "@/lib/recipes";
import {
  CostSettings, CostDepartment, ExpenseSettings, Concert, CostItem, CostOutgoing,
  WarehouseItem, FoodCategory, ConcertFood,
} from "@/types";
import {
  SlidersHorizontal, ToggleLeft, Activity, Tag, Plus, X, Save, ChevronLeft,
  AlertTriangle, CheckCircle2, Percent, Users, UtensilsCrossed, LogIn,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   مركز التحكم — كل ما يُضبط في النظام في مكان واحد.

   كانت الإعدادات منثورة: الضريبة في صفحة الإعدادات، والوحدات والأقسام
   داخل نافذة في صفحة التكاليف، وأنواع المصروفات في صفحة الحفلة. فمن
   أراد ضبط النظام تنقّل بين ست شاشات ولم يعرف ما فاته.
   ═══════════════════════════════════════════════════════════════ */

type Tab = "settings" | "features" | "health" | "labels";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "settings", label: "الإعدادات", icon: <SlidersHorizontal size={15} /> },
  { key: "features", label: "الميزات", icon: <ToggleLeft size={15} /> },
  { key: "health", label: "صحة النظام", icon: <Activity size={15} /> },
  { key: "labels", label: "الأسماء", icon: <Tag size={15} /> },
];

/* ── مفتاح تشغيل ── */
function Switch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} role="switch" aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`} />
    </button>
  );
}

/* ── قائمة قيم نصية (وحدات، أنواع مصروفات) ── */
function TagList({
  values, onAdd, onRemove, placeholder, tone = "navy",
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
  tone?: "navy" | "amber";
}) {
  const [input, setInput] = useState("");
  const cls = tone === "navy" ? "bg-[#EEF1F7] text-[#1C2D50]" : "bg-amber-50 text-amber-700";
  function add() {
    const v = input.trim();
    if (!v || values.includes(v)) return;
    onAdd(v);
    setInput("");
  }
  return (
    <div>
      <div className="flex gap-2 mb-2.5">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
        <Button type="button" variant="outline" size="sm" onClick={add}><Plus size={14} /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <p className="text-xs text-slate-400">لا توجد قيم بعد</p>
        ) : values.map((v) => (
          <span key={v} className={`flex items-center gap-1 text-sm px-3 py-1 rounded-full font-medium ${cls}`}>
            {v}
            <button type="button" onClick={() => onRemove(v)} className="opacity-50 hover:opacity-100 hover:text-red-500 transition-colors">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── سطر فحص في صحة النظام ── */
function Check({ count, title, why, href, unit = "سجل" }: {
  count: number; title: string; why: string; href: string; unit?: string;
}) {
  const ok = count === 0;
  return (
    <Link href={href}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        ok ? "border-slate-100 bg-white hover:bg-slate-50" : "border-amber-200 bg-amber-50 hover:bg-amber-100"
      }`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-100 text-amber-700"}`}>
        {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${ok ? "text-slate-700" : "text-amber-900"}`}>{title}</p>
        <p className={`text-[11px] leading-relaxed ${ok ? "text-slate-400" : "text-amber-700"}`}>{ok ? "لا شيء يحتاج انتباهاً" : why}</p>
      </div>
      <span className={`text-sm font-bold tabular-nums-auto shrink-0 ${ok ? "text-slate-300" : "text-amber-700"}`}>
        {ok ? "✓" : `${count.toLocaleString("en-US")} ${unit}`}
      </span>
      <ChevronLeft size={14} className="text-slate-300 shrink-0" />
    </Link>
  );
}

export default function ControlCenterPage() {
  const { appUser } = useAuth();
  const { reload: reloadSystem } = useSystem();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";

  const [tab, setTab] = useState<Tab>("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [vat, setVat] = useState("15");
  const [idle, setIdle] = useState("6");
  const [costSettings, setCostSettings] = useState<CostSettings>({ units: [], departments: [] });
  const [deptInput, setDeptInput] = useState("");
  const [deptLinked, setDeptLinked] = useState(false);
  const [deptKind, setDeptKind] = useState<"plain" | "concert" | "contract" | "restaurant">("plain");
  const [expenseTypes, setExpenseTypes] = useState<ExpenseSettings["types"]>([]);
  const [features, setFeatures] = useState<SystemFeatures>(DEFAULT_FEATURES);
  const [labels, setLabels] = useState<SystemLabels>(DEFAULT_LABELS);

  /* بيانات فحوص الصحة */
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [outgoing, setOutgoing] = useState<CostOutgoing[]>([]);
  const [whItems, setWhItems] = useState<WarehouseItem[]>([]);
  const [foodCats, setFoodCats] = useState<FoodCategory[]>([]);
  const [allFood, setAllFood] = useState<ConcertFood[]>([]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function load() {
    setLoading(true);
    const [sys, vatRate, cs, es, cons, items, out, wh, food, cFood] = await Promise.all([
      getSystemSettings(),
      getVatRate().catch(() => 15),
      getCostSettings().catch(() => ({ units: [], departments: [] } as CostSettings)),
      getExpenseSettings().catch(() => ({ types: [] } as ExpenseSettings)),
      getConcerts().catch(() => [] as Concert[]),
      getCostItems().catch(() => [] as CostItem[]),
      getCostOutgoing().catch(() => [] as CostOutgoing[]),
      getWarehouseItems().catch(() => [] as WarehouseItem[]),
      getFoodCategories().catch(() => [] as FoodCategory[]),
      getAllConcertFood().catch(() => [] as ConcertFood[]),
    ]);
    setFeatures(sys.features);
    setLabels(sys.labels);
    setVat(String(vatRate));
    setIdle(String(sys.idleMonths));
    setCostSettings(cs);
    setExpenseTypes(es.types ?? []);
    setConcerts(cons);
    setCostItems(items);
    setOutgoing(out);
    setWhItems(wh);
    setFoodCats(food);
    setAllFood(cFood);
    setLoading(false);
  }

  async function run(key: string, fn: () => Promise<void>, msg: string) {
    setSaving(key);
    try {
      await fn();
      showToast(msg);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(null);
    }
  }

  if (appUser && !isAdmin) {
    return <p className="text-center text-slate-400 py-12">مركز التحكم للمدير فقط</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  /* ── فحوص الصحة ── */
  const today = new Date().toISOString().slice(0, 10);
  const activeConcerts = concerts.filter((c) => normalizeStatus(c.status) !== "cancelled");

  const noPriceCost = costItems.filter((i) => (i.totalIn ?? 0) > 0 && !(i.totalInValue ?? 0));
  const negativeBalance = costItems.filter((i) => itemBalance(i) < 0);
  const expired = costItems.filter((i) => i.expiryDate && i.expiryDate < today && itemBalance(i) > 0);
  const noPriceExternal = whItems.filter((i) => i.type === "external" && !i.pricePerUnit);
  const orphanOutgoing = outgoing.filter((o) => !o.concertId && o.manualConcertName);
  const noSupervisor = activeConcerts.filter((c) => (c.supervisorIds ?? []).length === 0);
  const noPrice = activeConcerts.filter((c) => !c.price);
  const recipeless = foodCats.reduce(
    (n, c) => n + (c.optionDefs ?? []).filter((d) => !d.recipe?.length).length, 0
  );

  /* حفلات مضى موعدها ولها أصناف أكل ولم يُسجَّل لها أي صرف خامات.
     إنشاء الحفلة لا يخصم شيئاً، فالنسيان هنا يُخفي التكلفة ويضخّم
     المخزون معاً بلا أي رسالة خطأ. */
  const dispensedConcertIds = new Set(outgoing.filter((o) => o.concertId).map((o) => o.concertId as string));
  const foodConcertIds = new Set(allFood.map((f) => f.concertId));
  const undispensed = activeConcerts.filter((c) => {
    const past = (c.date?.seconds ?? 0) * 1000 < Date.now() - 86400000;
    return past && foodConcertIds.has(c.id) && !dispensedConcertIds.has(c.id);
  });

  const issues =
    noPriceCost.length + negativeBalance.length + expired.length + noPriceExternal.length +
    orphanOutgoing.length + noSupervisor.length + noPrice.length + undispensed.length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">مركز التحكم</h2>
        <p className="text-sm text-slate-500">
          كل ما يُضبط في النظام من مكان واحد
          {issues > 0 && <span className="text-amber-700 font-semibold"> — {issues.toLocaleString("en-US")} بند يحتاج انتباهك</span>}
        </p>
      </div>

      {/* تبويبات */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}>
            {t.icon}
            {t.label}
            {t.key === "health" && issues > 0 && (
              <span className={`text-[10px] px-1.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>
                {issues}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ الإعدادات ═══ */}
      {tab === "settings" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Percent size={15} className="text-[#1C2D50]" />
              <p className="font-bold text-slate-800">نسبة الضريبة المضافة</p>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              تُستعمل في العقود وحساب الصافي قبل الضريبة في الربحية. تغييرها لا يمسّ العقود المطبوعة سابقاً.
            </p>
            <div className="flex gap-2 items-end max-w-xs">
              <Input label="النسبة (%)" type="number" min={0} max={100} step="0.5" value={vat}
                onChange={(e) => setVat(e.target.value)} className="flex-1" />
              <Button loading={saving === "vat"}
                onClick={() => run("vat", async () => {
                  const r = parseFloat(vat);
                  if (isNaN(r) || r < 0 || r > 100) throw new Error("أدخل نسبة بين 0 و100");
                  await updateVatRate(r);
                }, "حُفظت نسبة الضريبة")}>
                <Save size={14} /> حفظ
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <LogIn size={15} className="text-[#1C2D50]" />
              <p className="font-bold text-slate-800">حدّ الحساب الخامل</p>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              الحساب الذي لم يُسجَّل دخوله خلال هذه المدة يظهر بتحذير أحمر في صفحة الموظفين.
              المقياس آخر <span className="font-semibold">تسجيل دخول</span> لا عدد العمليات — فالمشرف
              والموظف والمطبخ يقرؤون ولا يكتبون، وعدد عملياتهم صفر مهما دخلوا يومياً.
            </p>
            <div className="flex gap-2 items-end max-w-xs">
              <Input label="المدة (شهور)" type="number" min={1} max={60} step="1" value={idle}
                onChange={(e) => setIdle(e.target.value)} className="flex-1" />
              <Button loading={saving === "idle"}
                onClick={() => run("idle", async () => {
                  const m = parseInt(idle, 10);
                  if (isNaN(m) || m < 1 || m > 60) throw new Error("أدخل عدد شهور بين 1 و60");
                  await updateIdleMonths(m);
                }, "حُفظ حدّ الخمول")}>
                <Save size={14} /> حفظ
              </Button>
            </div>
          </Card>

          <Card>
            <p className="font-bold text-slate-800 mb-1">وحدات التكاليف</p>
            <p className="text-xs text-slate-500 mb-3">
              تُختار عند تسجيل الصنف وتُقفل بعد أول وارد عليه. حذف وحدة لا يغيّر الأصناف المسجّلة بها.
            </p>
            <TagList
              values={costSettings.units}
              placeholder="اكتب وحدة جديدة واضغط Enter..."
              onAdd={(v) => setCostSettings((p) => ({ ...p, units: [...p.units, v] }))}
              onRemove={(v) => setCostSettings((p) => ({ ...p, units: p.units.filter((u) => u !== v) }))}
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" loading={saving === "units"}
                onClick={() => run("units", () => updateCostSettings(costSettings), "حُفظت الوحدات")}>
                <Save size={14} /> حفظ الوحدات
              </Button>
            </div>
          </Card>

          <Card>
            <p className="font-bold text-slate-800 mb-1">أقسام المنصرف</p>
            <p className="text-xs text-slate-500 mb-3">
              القسم المعلَّم «يرتبط بالحفلات» يطالب باختيار العميل عند الصرف، فتُحمَّل التكلفة على حفلته.
            </p>
            <div className="flex gap-2 mb-2.5 flex-wrap">
              <input type="text" value={deptInput} onChange={(e) => setDeptInput(e.target.value)}
                placeholder="اسم القسم..."
                className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
              <select value={deptKind} onChange={(e) => setDeptKind(e.target.value as typeof deptKind)}
                className="border border-slate-200 rounded-xl px-2 py-2 text-xs bg-white">
                <option value="plain">قسم عادي</option>
                <option value="concert">يرتبط بالحفلات</option>
                <option value="contract">يرتبط بالتعاقدات</option>
                <option value="restaurant">قسم مطعم</option>
              </select>
              <Button type="button" variant="outline" size="sm"
                onClick={() => {
                  const v = deptInput.trim();
                  if (!v || costSettings.departments.some((d) => d.name === v)) return;
                  const dept: CostDepartment = {
                    name: v,
                    concertLinked: deptKind === "concert",
                    contractLinked: deptKind === "contract",
                    restaurant: deptKind === "restaurant",
                  };
                  setCostSettings((p) => ({ ...p, departments: [...p.departments, dept] }));
                  setDeptInput(""); setDeptKind("plain");
                }}>
                <Plus size={14} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {costSettings.departments.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد أقسام بعد</p>
              ) : costSettings.departments.map((d) => (
                <span key={d.name} className="flex items-center gap-1 bg-amber-50 text-amber-700 text-sm px-3 py-1 rounded-full font-medium">
                  {d.name}
                  {d.concertLinked && <span className="text-[10px] opacity-70">(حفلات)</span>}
                  {d.contractLinked && <span className="text-[10px] opacity-70">(تعاقدات)</span>}
                  {d.restaurant && <span className="text-[10px] opacity-70">(مطعم)</span>}
                  <button type="button" onClick={() => setCostSettings((p) => ({ ...p, departments: p.departments.filter((x) => x.name !== d.name) }))}
                    className="opacity-50 hover:opacity-100 hover:text-red-500 transition-colors"><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <Button size="sm" loading={saving === "depts"}
                onClick={() => run("depts", () => updateCostSettings(costSettings), "حُفظت الأقسام")}>
                <Save size={14} /> حفظ الأقسام
              </Button>
            </div>
          </Card>

          <Card>
            <p className="font-bold text-slate-800 mb-1">أنواع مصروفات الحفلة</p>
            <p className="text-xs text-slate-500 mb-3">
              تظهر عند إضافة فاتورة مصروفات على حفلة مؤكدة (سيارات مؤجرة، إيجار عمالة، أخرى).
            </p>
            <TagList
              tone="amber"
              values={expenseTypes.map((t) => t.name)}
              placeholder="اكتب نوعاً جديداً واضغط Enter..."
              onAdd={(v) => setExpenseTypes((p) => [...p, { name: v, kind: "other" }])}
              onRemove={(v) => setExpenseTypes((p) => p.filter((t) => t.name !== v))}
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" loading={saving === "exp"}
                onClick={() => run("exp", () => updateExpenseSettings({ types: expenseTypes }), "حُفظت أنواع المصروفات")}>
                <Save size={14} /> حفظ الأنواع
              </Button>
            </div>
          </Card>

          <Card>
            <p className="font-bold text-slate-800 mb-3">إعدادات لها صفحاتها الخاصة</p>
            <div className="space-y-1.5">
              {[
                { label: "المستخدمون والأدوار والصلاحيات", href: "/settings", icon: <Users size={14} /> },
                { label: "أقسام الأكل وأصنافها ووصفاتها", href: "/admin/food", icon: <UtensilsCrossed size={14} /> },
                { label: "أصناف التكاليف وباركوداتها", href: "/admin/costs", icon: <Tag size={14} /> },
              ].map((l) => (
                <Link key={l.href} href={l.href}
                  className="flex items-center gap-2 border border-slate-100 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <span className="text-slate-400">{l.icon}</span>
                  <span className="flex-1">{l.label}</span>
                  <ChevronLeft size={14} className="text-slate-300" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ الميزات ═══ */}
      {tab === "features" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
            <ToggleLeft size={15} className="shrink-0 mt-0.5" />
            <p>
              إيقاف الميزة يخفيها عن <strong>الجميع</strong> فوراً — من التنقّل ومن الرابط المباشر —
              و<strong>لا يحذف أي بيانات</strong>؛ تعود كما كانت بمجرد تشغيلها.
              هذا أوسع من الصلاحيات: الصلاحية تحجب عن شخص، والإيقاف يغلق الميزة للجميع.
            </p>
          </div>

          <Card>
            <div className="space-y-1">
              {FEATURE_META.map((f) => (
                <div key={f.key} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-none">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{f.hint}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    features[f.key] ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {features[f.key] ? "تعمل" : "موقوفة"}
                  </span>
                  <Switch on={features[f.key]} onToggle={() => setFeatures((p) => ({ ...p, [f.key]: !p[f.key] }))} />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button loading={saving === "features"}
                onClick={() => run("features", async () => {
                  await updateSystemFeatures(features);
                  await reloadSystem();
                }, "حُفظت حالة الميزات")}>
                <Save size={14} /> حفظ الميزات
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══ صحة النظام ═══ */}
      {tab === "health" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "الحفلات", v: concerts.length },
              { l: "أصناف التكاليف", v: costItems.length },
              { l: "مواد الموارد", v: whItems.length },
              { l: "عمليات الصرف", v: outgoing.length },
            ].map((s) => (
              <Card key={s.l}>
                <p className="text-xs text-slate-500">{s.l}</p>
                <p className="text-xl font-bold text-[#1C2D50] tabular-nums-auto mt-0.5">{s.v.toLocaleString("en-US")}</p>
              </Card>
            ))}
          </div>

          <Card>
            <p className="font-bold text-slate-800 mb-1">ما يحتاج انتباهك</p>
            <p className="text-xs text-slate-500 mb-3">
              كل بند هنا يجعل رقماً في النظام ناقصاً أو مضلِّلاً — اضغطه للذهاب إلى موضعه.
            </p>
            <div className="space-y-1.5">
              <Check count={undispensed.length} unit="حفلة" href="/admin/costs/outgoing"
                title="حفلات انتهت ولم يُسجَّل لها صرف خامات"
                why="تظهر بتكلفة خامات صفر في الربحية، ويظهر المخزون أوفر مما هو — خطأ صامت بلا رسالة" />
              <Check count={noPriceCost.length} unit="صنف" href="/admin/costs/incoming"
                title="أصناف تكاليف بلا سعر"
                why="دخلت المخزون بلا قيمة، فتكلفتها في الإنتاج والحفلات تُحسب صفراً" />
              <Check count={negativeBalance.length} unit="صنف" href="/admin/costs/balance"
                title="أرصدة سالبة"
                why="صُرف أكثر مما ورد — إما وارد لم يُسجَّل أو صرف مكرّر" />
              <Check count={expired.length} unit="صنف" href="/admin/costs/damage"
                title="أصناف انتهت صلاحيتها وما زال لها رصيد"
                why="إما أن تُسجَّل تالفاً أو يُصحَّح تاريخها — وإلا ظهرت متاحة للصرف" />
              <Check count={noPriceExternal.length} unit="مادة" href="/admin/warehouse"
                title="مواد خارجية بلا سعر"
                why="لا تدخل في تكلفة الحفلة، فيظهر ربحها أعلى من حقيقته" />
              <Check count={orphanOutgoing.length} unit="عملية" href="/admin/costs/outgoing"
                title="صرف باسم مكتوب يدوياً"
                why="لا يُحمَّل على أي حفلة، فتنقص تكلفتها بمقداره" />
              <Check count={noSupervisor.length} unit="حفلة" href="/admin/concerts"
                title="حفلات غير ملغاة بلا مشرف"
                why="لا أحد مسؤول عن تنفيذها ولا تظهر لأحد في قائمة مهامه" />
              <Check count={noPrice.length} unit="حفلة" href="/admin/concerts"
                title="حفلات بلا سعر"
                why="لا تدخل في القائمة المالية ولا في حساب الربحية" />
            </div>
          </Card>

          <Card>
            <p className="font-bold text-slate-800 mb-1">ملاحظات لا تستوجب إصلاحاً</p>
            <div className="text-xs text-slate-500 space-y-1.5 mt-2">
              <p>· {recipeless.toLocaleString("en-US")} صنف أكل بلا وصفة — لن يُظهر متوفراً ولا تكلفة تقديرية عند اختياره.</p>
              <p>· {costItems.filter((i) => i.productionRecipe?.length).length.toLocaleString("en-US")} صنف له خلطة قياسية محفوظة.</p>
            </div>
          </Card>
        </div>
      )}

      {/* ═══ الأسماء ═══ */}
      {tab === "labels" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-4 py-3 text-xs text-[#1C2D50] leading-relaxed">
            <Tag size={15} className="shrink-0 mt-0.5" />
            <p>
              هذه المسمّيات تظهر في <strong>قائمة التنقّل وترويسة البرنامج</strong>. تغييرها لا يمسّ البيانات
              ولا أسماء الحقول داخل الشاشات ولا نصوص العقد المطبوع.
            </p>
          </div>

          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="اسم الجهة" value={labels.brandName}
                onChange={(e) => setLabels({ ...labels, brandName: e.target.value })} />
              <Input label="قسم الحفلات" value={labels.concerts}
                onChange={(e) => setLabels({ ...labels, concerts: e.target.value })} />
              <Input label="قسم الموارد" value={labels.warehouse}
                onChange={(e) => setLabels({ ...labels, warehouse: e.target.value })} />
              <Input label="قسم التكاليف" value={labels.costs}
                onChange={(e) => setLabels({ ...labels, costs: e.target.value })} />
              <Input label="قسم المطبخ" value={labels.kitchen}
                onChange={(e) => setLabels({ ...labels, kitchen: e.target.value })} />
              <Input label="صفحة الربحية" value={labels.profitability}
                onChange={(e) => setLabels({ ...labels, profitability: e.target.value })} />
            </div>
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => setLabels(DEFAULT_LABELS)}
                className="text-xs font-semibold text-slate-500 hover:text-[#1C2D50]">
                إعادة الأسماء الافتراضية
              </button>
              <Button loading={saving === "labels"}
                onClick={() => run("labels", async () => {
                  const clean: SystemLabels = { ...DEFAULT_LABELS };
                  (Object.keys(clean) as (keyof SystemLabels)[]).forEach((k) => {
                    const v = labels[k]?.trim();
                    if (v) clean[k] = v; // اسم فارغ يعود للافتراضي بدل أن يختفي القسم
                  });
                  setLabels(clean);
                  await updateSystemLabels(clean);
                  await reloadSystem();
                }, "حُفظت الأسماء")}>
                <Save size={14} /> حفظ الأسماء
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
