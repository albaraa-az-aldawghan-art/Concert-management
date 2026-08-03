"use client";

/* المفقودات كما يراها مسؤول الموارد. */
import { useEffect, useState } from "react";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { MissingItem } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export default function WarehouseManagerMissingPage() {
  const [items, setItems] = useState<MissingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    async function load() {
      const data = await getAllMissingItems();
      setItems(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">المفقودات</h2>
        <p className="text-sm text-slate-500">{items.length} سجل</p>
      </div>

      <div className="flex gap-2">
        {["", "internal", "external"].map((t) => (
          <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === t ? "bg-red-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {t === "" ? "الكل" : t === "internal" ? "داخلي" : "خارجي"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <AlertTriangle size={40} className="mb-3 opacity-40" /><p>لا توجد مفقودات</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">الحفلة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">الغرض</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">النوع</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">العدد</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-700">{item.concertName}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{item.itemName}</td>
                    <td className="py-2 px-3"><StatusBadge status={item.type} /></td>
                    <td className="py-2 px-3 text-red-600 font-bold">{item.missingCount}</td>
                    <td className="py-2 px-3 text-slate-400 text-xs">{formatDateTime(item.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
