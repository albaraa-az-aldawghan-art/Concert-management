"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsByEmployee, getConcerts, getConcertItems } from "@/lib/firestore/concerts";
import { getConcertFood } from "@/lib/firestore/food";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Concert, ConcertItem, ConcertFood } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";
import { Package, UtensilsCrossed, Music, CalendarDays, Clock, MapPin } from "lucide-react";

interface ConcertBundle {
  concert: Concert;
  items: ConcertItem[];
  food: ConcertFood[];
}

// Employees are pure VIEWERS: they see the concerts they belong to — name,
// date, time, materials (internal/external) with counts, and the food
// sections with per-option quantities and totals. No actions of any kind.
export default function EmployeeAssignmentsPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [bundles, setBundles] = useState<ConcertBundle[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    async function load() {
      if (!appUser) return;
      setLoading(true);
      try {
        const concerts = isAdmin
          ? await getConcerts()
          : await getConcertsByEmployee(appUser.uid);
        const data = await Promise.all(
          concerts.map(async (concert) => {
            const [items, food] = await Promise.all([
              getConcertItems(concert.id).catch(() => []),
              getConcertFood(concert.id).catch(() => []),
            ]);
            return { concert, items, food };
          })
        );
        setBundles(data);
      } catch {
        showToast("حدث خطأ أثناء تحميل البيانات", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "حفلات الموظفين" : "حفلاتي"}</h2>
        <p className="text-sm text-slate-500">
          {bundles.length} حفلة — للاطلاع فقط
        </p>
      </div>

      {bundles.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Music size={40} className="mb-3 opacity-40" />
          <p>لا توجد حفلات مسندة إليك</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {bundles.map(({ concert, items, food }) => {
            const internal = items.filter((i) => i.type === "internal");
            const external = items.filter((i) => i.type === "external");
            const totalMaterials = items.reduce((s, i) => s + (i.count ?? 0), 0);
            const totalFood = food.reduce((s, f) => s + (f.quantity ?? 0), 0);

            // Group food by category
            const groups = new Map<string, ConcertFood[]>();
            for (const f of food) {
              if (!groups.has(f.categoryName)) groups.set(f.categoryName, []);
              groups.get(f.categoryName)!.push(f);
            }

            return (
              <Card key={concert.id}>
                {/* Concert header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-base truncate">{concert.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1 tabular-nums-auto">
                        <CalendarDays size={13} className="text-[#1C2D50]" />
                        {formatDate(concert.date)}
                      </span>
                      <span className="flex items-center gap-1 font-bold text-[#1C2D50] tabular-nums-auto">
                        <Clock size={13} />
                        {formatTime(concert.date)}
                      </span>
                      {concert.venueName && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} className="text-slate-400" />
                          {concert.venueName}
                        </span>
                      )}
                    </div>
                  </div>
                  {concert.concertNumber != null && (
                    <span className="text-xs font-bold bg-[#1C2D50] text-[#D4DCE8] px-2.5 py-1 rounded-full shrink-0">
                      #{String(concert.concertNumber).padStart(3, "0")}
                    </span>
                  )}
                </div>

                {/* Materials */}
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                    <Package size={13} className="text-indigo-500" />
                    المواد
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full tabular-nums-auto">
                      المجموع {totalMaterials}
                    </span>
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-400">لا توجد مواد</p>
                  ) : (
                    <div className="space-y-2">
                      {([
                        { label: "داخلية", list: internal, chip: "bg-[#EEF1F7] text-[#1C2D50]" },
                        { label: "خارجية", list: external, chip: "bg-amber-50 text-amber-700" },
                      ] as const).filter((g) => g.list.length > 0).map((g) => (
                        <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-400 ml-1">{g.label}:</span>
                          {g.list.map((it) => (
                            <span key={it.id} className={`text-xs px-2.5 py-1 rounded-full font-medium tabular-nums-auto ${g.chip}`}>
                              {it.itemName} ×{it.count}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Food */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                  <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                    <UtensilsCrossed size={13} className="text-orange-500" />
                    أقسام الأكل والأصناف
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full tabular-nums-auto">
                      المجموع {totalFood}
                    </span>
                  </p>
                  {food.length === 0 ? (
                    <p className="text-xs text-slate-400">لا توجد أصناف أكل</p>
                  ) : (
                    <div className="space-y-2">
                      {[...groups.entries()].map(([catName, catFood]) => (
                        <div key={catName}>
                          <span className="inline-block bg-[#1C2D50] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                            {catName}
                            <span className="opacity-75 font-medium tabular-nums-auto">
                              {" "}({catFood.reduce((s, f) => s + (f.quantity ?? 0), 0)})
                            </span>
                          </span>
                          <p className="text-[13px] text-slate-700 leading-relaxed mt-1 pr-0.5" style={{ wordBreak: "break-word" }}>
                            {catFood.map((f, i) => (
                              <span key={f.id}>
                                {i > 0 && <span className="text-slate-300">، </span>}
                                <span className="whitespace-nowrap">
                                  {f.selectedOption}
                                  {f.quantity != null && f.quantity > 0 && (
                                    <b className="text-[#1C2D50] tabular-nums-auto"> ×{f.quantity}</b>
                                  )}
                                </span>
                              </span>
                            ))}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
