"use client";

/* اختيار أصناف الأكل للحفلة من هيكل منتجات البيع: أقسام قناة الحفلات،
   وتحت كل قسم أصنافها القادمة من التكاليف — بأرصدتها وتكلفتها. */

import { useMemo, useState } from "react";
import { CostItem, SalesSection, ConcertPackage } from "@/types";
import { itemBalance, averageCost } from "@/lib/recipes";
import { itemsOfSection } from "@/lib/firestore/sales";
import { UtensilsCrossed, Search, Package as PackageIcon, FlaskConical, Boxes } from "lucide-react";

export interface FoodPick {
  /** مفتاح فريد للسطر: القسم + الباركود */
  key: string;
  sectionId: string;
  sectionName: string;
  barcode: string;
  itemName: string;
  unit: string;
  quantity: string;
}

export function foodPickKey(sectionId: string, barcode: string) {
  return `${sectionId}:::${barcode}`;
}

export function SalesFoodPicker({
  sections,
  items,
  picks,
  onToggle,
  onQuantity,
  packages,
  onApplyPackage,
  committed,
}: {
  sections: SalesSection[];
  items: CostItem[];
  picks: Record<string, { checked: boolean; quantity: string }>;
  onToggle: (sectionId: string, sectionName: string, item: CostItem) => void;
  onQuantity: (sectionId: string, barcode: string, qty: string) => void;
  packages?: ConcertPackage[];
  onApplyPackage?: (p: ConcertPackage) => void;
  /** المرتبط بحفلات قادمة أخرى — لعرض المتاح فعلياً لا الرصيد الخام */
  committed?: Map<string, number>;
}) {
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const section = useMemo(
    () => sections.find((s) => s.id === activeSection) ?? sections[0],
    [sections, activeSection]
  );

  const q = search.trim();
  const list = section
    ? itemsOfSection(items, section.id).filter((i) => !q || i.name.includes(q) || i.id.includes(q))
    : [];

  if (sections.length === 0) {
    return (
      <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center">
        <UtensilsCrossed size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500 font-semibold">لا توجد أقسام بيع للحفلات بعد</p>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          تُضاف من <strong>منتجات البيع ← مبيعات الحفلات</strong>، وأصنافها تُختار من التكاليف.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* البكجات الجاهزة */}
      {packages && packages.length > 0 && onApplyPackage && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
          <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
            <Boxes size={13} /> بكجات جاهزة — الضغط يضيف كل أصنافها ثم تعدّلها كما تشاء
          </p>
          <div className="flex flex-wrap gap-2">
            {packages.map((p) => (
              <button key={p.id} type="button" onClick={() => onApplyPackage(p)}
                className="bg-white border border-amber-200 hover:border-amber-400 rounded-lg px-3 py-1.5 text-right transition-colors">
                <span className="text-sm font-semibold text-amber-900 block">{p.name}</span>
                <span className="text-[10px] text-amber-600 tabular-nums-auto">
                  {p.items.length} صنف
                  {p.materials.length > 0 && ` · ${p.materials.length} مادة`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* أقسام قناة الحفلات */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((s) => {
          const count = Object.entries(picks).filter(
            ([k, v]) => v.checked && k.startsWith(`${s.id}:::`)
          ).length;
          return (
            <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                section?.id === s.id
                  ? "bg-orange-500 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}>
              {s.name}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 rounded-full tabular-nums-auto ${
                  section?.id === s.id ? "bg-white/25" : "bg-orange-100 text-orange-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* بحث داخل القسم */}
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في أصناف القسم..."
          className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
      </div>

      {/* أصناف القسم */}
      <div className="border border-orange-100 rounded-xl overflow-hidden">
        <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100 flex items-center gap-2">
          <UtensilsCrossed size={13} className="text-orange-500" />
          <p className="text-sm font-semibold text-orange-700">{section?.name}</p>
          <span className="text-[11px] text-orange-500 mr-auto">{list.length} صنف</span>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            {q ? "لا توجد نتائج مطابقة" : "لا توجد أصناف في هذا القسم — أضِفها من منتجات البيع"}
          </p>
        ) : (
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {list.map((item) => {
              const key = foodPickKey(section!.id, item.id);
              const state = picks[key];
              const checked = state?.checked ?? false;
              const qty = parseFloat(state?.quantity ?? "") || 0;
              const balance = itemBalance(item);
              const held = committed?.get(item.id) ?? 0;
              const available = Math.round((balance - held) * 1000) / 1000;
              const short = qty > 0 && qty > available;

              return (
                <div key={key}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${checked ? "bg-orange-50" : "hover:bg-slate-50"}`}>
                  <button type="button" onClick={() => onToggle(section!.id, section!.name, item)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      checked ? "bg-orange-500 border-orange-500" : "border-slate-300 hover:border-orange-400"
                    }`}>
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <span className="flex-1 min-w-0 text-sm cursor-pointer select-none"
                    onClick={() => onToggle(section!.id, section!.name, item)}>
                    <span className={checked ? "font-semibold text-slate-800" : "text-slate-600"}>
                      {item.name}
                    </span>
                    {item.productionRecipe?.length ? (
                      <FlaskConical size={11} className="inline text-emerald-600 mr-1.5" />
                    ) : (
                      <PackageIcon size={11} className="inline text-slate-400 mr-1.5" />
                    )}
                    <span className={`block text-[10px] mt-0.5 tabular-nums-auto ${short ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                      {qty > 0 ? `${qty.toLocaleString("en-US")}/` : "متاح "}
                      {available.toLocaleString("en-US")} {item.unit}
                      {held > 0 && ` (مرتبط ${held.toLocaleString("en-US")})`}
                      {averageCost(item) > 0 &&
                        ` · ${(Math.round(averageCost(item) * (qty || 1) * 100) / 100).toLocaleString("en-US")} ريال`}
                    </span>
                  </span>

                  {checked && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="text-xs text-slate-400 whitespace-nowrap">الكمية:</label>
                      <input type="number" min={1} value={state?.quantity ?? ""}
                        onChange={(e) => onQuantity(section!.id, item.id, e.target.value)}
                        placeholder="0"
                        className="w-16 border border-orange-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
