"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostItems } from "@/lib/firestore/costs";
import { Card } from "@/components/ui/card";
import { SearchBox, Pagination } from "@/components/ui/list-filters";
import { CostItem } from "@/types";
import { Scale } from "lucide-react";

const PAGE_SIZE = 10;

export default function CostsBalancePage() {
  const { appUser, can } = useAuth();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));

  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    async function load() {
      setItems(await getCostItems());
      setLoading(false);
    }
    load();
  }, []);

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
      <div>
        <h2 className="text-xl font-bold text-slate-800">رصيد الأصناف</h2>
        <p className="text-sm text-slate-500">{items.length} صنف</p>
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
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                <th className="px-4 py-3 font-semibold">الوارد</th>
                <th className="px-4 py-3 font-semibold">المنصرف</th>
                <th className="px-4 py-3 font-semibold">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((item) => {
                const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
                return (
                  <tr key={item.id} className="border-b border-slate-50 last:border-none">
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.id}</td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3 tabular-nums-auto text-emerald-600 font-medium">{(item.totalIn ?? 0).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 tabular-nums-auto text-orange-600 font-medium">{(item.totalOut ?? 0).toLocaleString("en-US")}</td>
                    <td className={`px-4 py-3 tabular-nums-auto font-bold ${balance <= 0 ? "text-red-600" : "text-[#1C2D50]"}`}>
                      {balance.toLocaleString("en-US")} {item.unit}
                    </td>
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
