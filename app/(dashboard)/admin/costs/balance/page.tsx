"use client";

/* رصيد الأصناف: المتوفر من كل خام وقيمته ومتوسط سعره. */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostItems } from "@/lib/firestore/costs";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchBox, Pagination, SortHeader, RangeFilter, inRange, ClearFiltersButton } from "@/components/ui/list-filters";
import { CostItem } from "@/types";
import { Scale, FileSpreadsheet } from "lucide-react";

const PAGE_SIZE = 50;
const r2 = (n: number) => Math.round(n * 100) / 100;

type SortKey = "name" | "kind" | "in" | "out" | "balance" | "unit" | "price" | "value";

interface Row {
  item: CostItem;
  kind: "raw" | "produced" | "sale";
  totalIn: number;
  totalOut: number;
  balance: number;
  value: number;
  avgPrice: number;
}

function rowOf(item: CostItem): Row {
  const totalIn = item.totalIn ?? 0;
  const totalOut = item.totalOut ?? 0;
  const balance = totalIn - totalOut;
  const value = item.totalInValue ?? 0;
  return {
    item,
    kind: item.kind ?? ((item.productionRecipe?.length ?? 0) > 0 ? "produced" : "raw"),
    totalIn, totalOut, balance, value,
    avgPrice: balance > 0 ? r2(value / balance) : 0,
  };
}

const emptyRanges = { inMin: "", inMax: "", outMin: "", outMax: "", balMin: "", balMax: "", priceMin: "", priceMax: "", valueMin: "", valueMax: "" };

export default function CostsBalancePage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = (isAdmin || can("costs")) && (isAdmin || feat("costs", "bal_view"));
  /* قيمة المخزون رقم مالي — تُفصل عن مجرّد رؤية الأرصدة */
  const showValue = isAdmin || feat("costs", "bf_value");
  const canExport = isAdmin || feat("costs", "export");

  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | "raw" | "produced" | "sale">("");
  const [unitFilter, setUnitFilter] = useState("");
  const [ranges, setRanges] = useState(emptyRanges);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setPage(1); }, [search, kindFilter, unitFilter, ranges]);

  useEffect(() => {
    async function load() {
      setItems(await getCostItems());
      setLoading(false);
    }
    load();
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const res = await fetch("/api/export/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذّر التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "رصيد الأصناف.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("نُزّل الملف");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر التصدير", "error");
    } finally {
      setExporting(false);
    }
  }

  const unitOptions = useMemo(
    () => [...new Set(items.map((i) => i.unit))].sort((a, b) => a.localeCompare(b, "ar")),
    [items]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const hasActiveFilters = kindFilter !== "" || unitFilter !== "" || Object.values(ranges).some((v) => v !== "");

  function clearFilters() {
    setKindFilter(""); setUnitFilter(""); setRanges(emptyRanges);
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = search.trim();
  const rows = items.map(rowOf).filter((r) => {
    if (q && !r.item.name.includes(q) && !r.item.id.includes(q)) return false;
    if (kindFilter && r.kind !== kindFilter) return false;
    if (unitFilter && r.item.unit !== unitFilter) return false;
    if (!inRange(r.totalIn, ranges.inMin, ranges.inMax)) return false;
    if (!inRange(r.totalOut, ranges.outMin, ranges.outMax)) return false;
    if (!inRange(r.balance, ranges.balMin, ranges.balMax)) return false;
    if (showValue && !inRange(r.avgPrice, ranges.priceMin, ranges.priceMax)) return false;
    if (showValue && !inRange(r.value, ranges.valueMin, ranges.valueMax)) return false;
    return true;
  });

  const SORT_VAL: Record<SortKey, (r: Row) => string | number> = {
    name: (r) => r.item.name, kind: (r) => r.kind, in: (r) => r.totalIn, out: (r) => r.totalOut,
    balance: (r) => r.balance, unit: (r) => r.item.unit, price: (r) => r.avgPrice, value: (r) => r.value,
  };
  const sorted = sortKey ? [...rows].sort((a, b) => {
    const av = SORT_VAL[sortKey](a), bv = SORT_VAL[sortKey](b);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string, "ar") : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  }) : rows;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">رصيد الأصناف</h2>
          <p className="text-sm text-slate-500">
            {sorted.length === items.length ? `${items.length} صنف` : `${sorted.length} من ${items.length} صنف`}
          </p>
        </div>
        {canExport && (
          <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
            <FileSpreadsheet size={14} /> تصدير إكسل
          </Button>
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
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Scale size={40} className="mb-3 opacity-40" />
          <p>{q || hasActiveFilters ? "لا توجد نتائج مطابقة" : "لا توجد أصناف تكاليف مسجّلة بعد"}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3"><SortHeader label="الصنف" sortKeyName="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-3 font-semibold">الباركود</th>
                <th className="px-4 py-3"><SortHeader label="النوع" sortKeyName="kind" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="الوارد" sortKeyName="in" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="المنصرف" sortKeyName="out" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="الرصيد" sortKeyName="balance" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                <th className="px-4 py-3"><SortHeader label="الوحدة" sortKeyName="unit" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                {showValue && <th className="px-4 py-3"><SortHeader label="متوسط السعر" sortKeyName="price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>}
                {showValue && <th className="px-4 py-3"><SortHeader label="القيمة" sortKeyName="value" activeKey={sortKey} dir={sortDir} onSort={toggleSort} /></th>}
              </tr>
              {/* صف الفلاتر — تحت رؤوس الأعمدة مباشرة، كل فلتر تحت عموده */}
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <td className="px-4 py-2"></td>
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
                  <RangeFilter min={ranges.inMin} max={ranges.inMax}
                    onMin={(v) => setRanges((r) => ({ ...r, inMin: v }))} onMax={(v) => setRanges((r) => ({ ...r, inMax: v }))} />
                </td>
                <td className="px-4 py-2">
                  <RangeFilter min={ranges.outMin} max={ranges.outMax}
                    onMin={(v) => setRanges((r) => ({ ...r, outMin: v }))} onMax={(v) => setRanges((r) => ({ ...r, outMax: v }))} />
                </td>
                <td className="px-4 py-2">
                  <RangeFilter min={ranges.balMin} max={ranges.balMax}
                    onMin={(v) => setRanges((r) => ({ ...r, balMin: v }))} onMax={(v) => setRanges((r) => ({ ...r, balMax: v }))} />
                </td>
                <td className="px-4 py-2">
                  <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-1.5 py-1 text-[11px] bg-white">
                    <option value="">الكل</option>
                    {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                {showValue && (
                  <td className="px-4 py-2">
                    <RangeFilter min={ranges.priceMin} max={ranges.priceMax}
                      onMin={(v) => setRanges((r) => ({ ...r, priceMin: v }))} onMax={(v) => setRanges((r) => ({ ...r, priceMax: v }))} />
                  </td>
                )}
                {showValue && (
                  <td className="px-4 py-2">
                    <RangeFilter min={ranges.valueMin} max={ranges.valueMax}
                      onMin={(v) => setRanges((r) => ({ ...r, valueMin: v }))} onMax={(v) => setRanges((r) => ({ ...r, valueMax: v }))} />
                  </td>
                )}
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.item.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.item.id}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                        r.kind === "produced" ? "bg-violet-50 text-violet-700" : r.kind === "sale" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                      }`}
                    >
                      {r.kind === "produced" ? "منتج مُصنَّع" : r.kind === "sale" ? "منتج بيع" : "مادة خام"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto text-emerald-600 font-medium">{r.totalIn.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 tabular-nums-auto text-orange-600 font-medium">{r.totalOut.toLocaleString("en-US")}</td>
                  <td className={`px-4 py-3 tabular-nums-auto font-bold ${r.balance <= 0 ? "text-red-600" : "text-[#1C2D50]"}`}>
                    {r.balance.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.item.unit}</td>
                  {showValue && (
                    <td className="px-4 py-3 tabular-nums-auto text-amber-700">{r.avgPrice.toLocaleString("en-US")}</td>
                  )}
                  {showValue && (
                    <td className="px-4 py-3 tabular-nums-auto text-amber-700 font-medium">{r.value.toLocaleString("en-US")}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
