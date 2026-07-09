"use client";

import { useEffect, useState } from "react";
import { getAllMissingItems } from "@/lib/firestore/missing-items";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { MissingItem } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export default function AdminMissingItemsPage() {
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
  const internalCount = items.filter((i) => i.type === "internal").length;
  const externalCount = items.filter((i) => i.type === "external").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">المفقودات</h2>
        <p className="text-sm text-slate-500">
          {internalCount} داخلي · {externalCount} خارجي
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["", "internal", "external"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterType === t
                ? "bg-red-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t === "" ? "الكل" : t === "internal" ? "داخلي" : "خارجي"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <AlertTriangle size={40} className="mb-3 opacity-40" />
          <p>لا توجد مفقودات</p>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { type: "internal", label: "داخلي", color: "bg-indigo-50 border-indigo-200" },
              { type: "external", label: "خارجي", color: "bg-orange-50 border-orange-200" },
            ].map(({ type, label, color }) => {
              const typeItems = items.filter((i) => i.type === type);
              if (typeItems.length === 0) return null;
              return (
                <Card key={type} className={`border ${color}`}>
                  <h3 className="font-bold text-slate-700 mb-3">{label} ({typeItems.length})</h3>
                  <div className="space-y-2">
                    {typeItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.itemName}</p>
                          <p className="text-xs text-slate-500">الحفلة: {item.concertName}</p>
                          <p className="text-xs text-slate-400">{formatDateTime(item.reportedAt)}</p>
                        </div>
                        <span className="text-lg font-bold text-red-600">{item.missingCount}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Full Table */}
          <Card>
            <h3 className="font-bold text-slate-800 mb-4">جميع المفقودات</h3>
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
                      <td className="py-2 px-3">
                        <StatusBadge status={item.type} />
                      </td>
                      <td className="py-2 px-3 text-red-600 font-bold">{item.missingCount}</td>
                      <td className="py-2 px-3 text-slate-400 text-xs">{formatDateTime(item.reportedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
