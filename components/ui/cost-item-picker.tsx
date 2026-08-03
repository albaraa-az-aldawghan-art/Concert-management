"use client";

/* اختيار صنف التكاليف: بالمسح أو من قائمة كاملة بأرصدتها. */
import { useState } from "react";
import { BarcodeScanInput } from "@/components/ui/barcode-scan-input";
import { CostItem } from "@/types";
import { itemBalance } from "@/lib/recipes";
import { Search, List } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   اختيار صنف التكاليف — بالمسح أو بالاختيار من القائمة.

   القارئ أسرع حين تكون المادة في اليد وعليها ملصق، لكن كثيراً ما
   تُسجَّل عملية دون وجود المادة أو لصنف بلا ملصق مطبوع، فلا بد من
   قائمة كاملة يُختار منها.
   ═══════════════════════════════════════════════════════════════ */

export function CostItemPicker({
  items,
  onPick,
  onScanMiss,
  showBalance = false,
}: {
  items: CostItem[];
  onPick: (item: CostItem) => void;
  /** يُنادى حين لا يطابق الباركود الممسوح أي صنف */
  onScanMiss: (barcode: string) => void;
  /** إظهار الرصيد بجانب كل صنف — يهم عند الصرف */
  showBalance?: boolean;
}) {
  const [mode, setMode] = useState<"scan" | "list">("scan");
  const [q, setQ] = useState("");

  function handleScan(barcode: string) {
    const found = items.find((i) => i.id === barcode.trim());
    if (found) onPick(found);
    else onScanMiss(barcode);
  }

  const query = q.trim();
  const filtered = query
    ? items.filter((i) => i.name.includes(query) || i.id.includes(query))
    : items;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {([
          { key: "scan", label: "مسح الباركود", icon: <Search size={13} /> },
          { key: "list", label: "اختيار من القائمة", icon: <List size={13} /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMode(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
              mode === t.key
                ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {mode === "scan" ? (
        <BarcodeScanInput onScan={handleScan} />
      ) : (
        <div>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الباركود..."
              autoFocus
              className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
            />
          </div>
          <div className="mt-1.5 max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 text-center">
                {items.length === 0
                  ? "لا توجد أصناف مسجّلة — سجّلها أولاً من صفحة أصناف التكاليف"
                  : "لا توجد نتائج مطابقة"}
              </p>
            ) : (
              filtered.map((i) => {
                const bal = itemBalance(i);
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onPick(i)}
                    className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">
                        {i.name}
                        {i.expiryDate && i.expiryDate < new Date().toISOString().slice(0, 10) && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold mr-1.5">
                            منتهٍ
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">{i.id}</p>
                    </div>
                    {showBalance && (
                      <span
                        className={`text-[11px] font-semibold tabular-nums-auto shrink-0 ${
                          bal <= 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {bal.toLocaleString("en-US")} {i.unit}
                      </span>
                    )}
                    {!showBalance && (
                      <span className="text-[10px] text-slate-400 shrink-0">{i.unit}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
