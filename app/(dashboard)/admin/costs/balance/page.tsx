"use client";

/* رصيد الأصناف: المتوفر من كل خام وقيمته ومتوسط سعره. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostItems } from "@/lib/firestore/costs";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchBox, Pagination } from "@/components/ui/list-filters";
import { CostItem } from "@/types";
import { Scale, FileSpreadsheet } from "lucide-react";

const PAGE_SIZE = 50;
const r2 = (n: number) => Math.round(n * 100) / 100;

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
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setPage(1); }, [search]);

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

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = search.trim();
  const filtered = items.filter((i) => !q || i.name.includes(q) || i.id.includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">رصيد الأصناف</h2>
          <p className="text-sm text-slate-500">{items.length} صنف</p>
        </div>
        {canExport && (
          <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
            <FileSpreadsheet size={14} /> تصدير إكسل
          </Button>
        )}
      </div>

      <div className="max-w-xs">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الباركود..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Scale size={40} className="mb-3 opacity-40" />
          <p>{q ? "لا توجد نتائج مطابقة للبحث" : "لا توجد أصناف تكاليف مسجّلة بعد"}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الباركود</th>
                <th className="px-4 py-3 font-semibold">النوع</th>
                <th className="px-4 py-3 font-semibold">الوارد</th>
                <th className="px-4 py-3 font-semibold">المنصرف</th>
                <th className="px-4 py-3 font-semibold">الرصيد</th>
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                {showValue && <th className="px-4 py-3 font-semibold">متوسط السعر</th>}
                {showValue && <th className="px-4 py-3 font-semibold">القيمة</th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map((item) => {
                const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
                const kind = item.kind ?? ((item.productionRecipe?.length ?? 0) > 0 ? "produced" : "raw");
                const value = item.totalInValue ?? 0;
                const avgPrice = balance > 0 ? r2(value / balance) : 0;
                return (
                  <tr key={item.id} className="border-b border-slate-50 last:border-none">
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                          kind === "produced" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"
                        }`}
                      >
                        {kind === "produced" ? "منتج مُصنَّع" : "مادة خام"}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums-auto text-emerald-600 font-medium">{(item.totalIn ?? 0).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 tabular-nums-auto text-orange-600 font-medium">{(item.totalOut ?? 0).toLocaleString("en-US")}</td>
                    <td className={`px-4 py-3 tabular-nums-auto font-bold ${balance <= 0 ? "text-red-600" : "text-[#1C2D50]"}`}>
                      {balance.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    {showValue && (
                      <td className="px-4 py-3 tabular-nums-auto text-amber-700">{avgPrice.toLocaleString("en-US")}</td>
                    )}
                    {showValue && (
                      <td className="px-4 py-3 tabular-nums-auto text-amber-700 font-medium">{value.toLocaleString("en-US")}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
