"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertById, getConcertItems } from "@/lib/firestore/concerts";
import { getConcertFood } from "@/lib/firestore/food";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { thumbUrl } from "@/lib/cloudinary";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Concert, ConcertItem, ConcertFood, WarehouseItem } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";
import { Package, UtensilsCrossed, CalendarDays, Clock, MapPin, ChevronRight, FileText } from "lucide-react";

// Read-only concert detail for employees: what, when, where — materials with
// images and counts, food sections with quantities. No actions whatsoever.
export default function EmployeeConcertViewPage() {
  const { id } = useParams<{ id: string }>();
  const { appUser } = useAuth();
  const { showToast } = useToast();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [food, setFood] = useState<ConcertFood[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [c, it, f, wh] = await Promise.all([
          getConcertById(id),
          getConcertItems(id).catch(() => []),
          getConcertFood(id).catch(() => []),
          getWarehouseItems().catch(() => []),
        ]);
        setConcert(c);
        setItems(it);
        setFood(f);
        setWarehouseItems(wh);
      } catch {
        showToast("حدث خطأ أثناء تحميل البيانات", "error");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!concert) {
    return <p className="text-center text-slate-400 py-12">لم يتم العثور على الحفلة</p>;
  }

  // Employees may only open concerts they belong to
  if (appUser && appUser.role === "employee" && !concert.employeeIds.includes(appUser.uid)) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بعرض هذه الحفلة</p>;
  }

  const imageOf = (it: ConcertItem) =>
    warehouseItems.find((w) => w.id === it.itemId)?.imageUrl ?? null;

  const internal = items.filter((i) => i.type === "internal");
  const external = items.filter((i) => i.type === "external");
  const totalMaterials = items.reduce((s, i) => s + (i.count ?? 0), 0);
  const totalFood = food.reduce((s, f) => s + (f.quantity ?? 0), 0);

  const groups = new Map<string, ConcertFood[]>();
  for (const f of food) {
    if (!groups.has(f.categoryName)) groups.set(f.categoryName, []);
    groups.get(f.categoryName)!.push(f);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <Link href="/employee/assignments" className="flex items-center gap-1 text-sm text-[#1C2D50] font-semibold w-fit">
        <ChevronRight size={16} /> العودة للحفلات
      </Link>

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <div className="bg-[#1C2D50] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-base truncate">{concert.name}</p>
            <p className="text-xs opacity-75 mt-0.5">للاطلاع فقط</p>
          </div>
          {concert.concertNumber != null && (
            <span className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-full shrink-0">
              #{String(concert.concertNumber).padStart(3, "0")}
            </span>
          )}
        </div>
        <div className="bg-white grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 px-5 py-3 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1"><CalendarDays size={11} /> التاريخ</p>
            <p className="font-bold text-slate-800 tabular-nums-auto">{formatDate(concert.date)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} /> الوقت</p>
            <p className="font-bold text-[#1C2D50] tabular-nums-auto">{formatTime(concert.date)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin size={11} /> المكان</p>
            <p className="font-bold text-slate-800">{concert.venueName || "—"}</p>
          </div>
        </div>
      </div>

      {/* Materials */}
      <Card>
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Package size={15} className="text-indigo-500" />
          المواد
          <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full tabular-nums-auto">
            المجموع الكلي {totalMaterials}
          </span>
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد مواد</p>
        ) : (
          <div className="space-y-3">
            {([
              { label: "داخلية", list: internal, chip: "bg-[#EEF1F7] text-[#1C2D50] border-[#D4DCE8]" },
              { label: "خارجية", list: external, chip: "bg-amber-50 text-amber-700 border-amber-100" },
            ] as const).filter((g) => g.list.length > 0).map((g) => (
              <div key={g.label}>
                <span className="block text-[11px] font-bold text-slate-400 mb-1.5">
                  {g.label} ({g.list.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.list.map((it) => {
                    const img = imageOf(it);
                    return (
                      <div key={it.id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${g.chip}`}>
                        {img ? (
                          <a href={img} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <img
                              src={thumbUrl(img, 100)}
                              alt={it.itemName}
                              loading="lazy"
                              className="w-10 h-10 object-cover rounded-lg border border-white/60"
                            />
                          </a>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/50 flex items-center justify-center shrink-0">
                            <Package size={15} className="opacity-40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{it.itemName}</p>
                          <p className="text-[11px] tabular-nums-auto">الكمية: <b>{it.count}</b></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Food */}
      <Card>
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <UtensilsCrossed size={15} className="text-orange-500" />
          أقسام الأكل والأصناف
          <span className="bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-full tabular-nums-auto">
            المجموع الكلي {totalFood}
          </span>
        </p>
        {food.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد أصناف أكل</p>
        ) : (
          <div className="space-y-3">
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
      </Card>

      {/* Notes */}
      {concert.notes && (
        <Card>
          <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <FileText size={15} className="text-slate-400" />
            ملاحظات
          </p>
          <p className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {concert.notes}
          </p>
        </Card>
      )}
    </div>
  );
}
