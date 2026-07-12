"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertById, getConcertItems } from "@/lib/firestore/concerts";
import { getConcertFood, getFoodCategories } from "@/lib/firestore/food";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getKitchenOrderByConcert, confirmKitchenOrder } from "@/lib/firestore/kitchen";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { thumbUrl } from "@/lib/cloudinary";
import { Concert, ConcertItem, ConcertFood, FoodCategory, WarehouseItem, KitchenOrder } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Printer, CheckCircle2, ChevronRight, UtensilsCrossed, Package } from "lucide-react";

export default function KitchenSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { appUser, can } = useAuth();
  const { showToast } = useToast();
  const canConfirm = can("kitchen", "manage");

  const [concert, setConcert] = useState<Concert | null>(null);
  const [food, setFood] = useState<ConcertFood[]>([]);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [order, setOrder] = useState<KitchenOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    async function load() {
      const [c, f, it, wh, cats, ord] = await Promise.all([
        getConcertById(id),
        getConcertFood(id),
        getConcertItems(id),
        getWarehouseItems(),
        getFoodCategories(),
        getKitchenOrderByConcert(id),
      ]);
      setConcert(c);
      setFood(f);
      setItems(it);
      setWarehouseItems(wh);
      setCategories(cats);
      setOrder(ord);
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  async function handleConfirm() {
    if (!appUser || !order) return;
    setConfirming(true);
    try {
      await confirmKitchenOrder(order.id, appUser.name);
      setOrder(await getKitchenOrderByConcert(id));
      showToast("تم تأكيد استلام الحفلة");
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setConfirming(false);
    }
  }

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

  // Group food by category, in the same custom order as the food admin page
  const catOrder = new Map(categories.map((c, i) => [c.name, c.order ?? i]));
  const groups = new Map<string, ConcertFood[]>();
  for (const f of food) {
    if (!groups.has(f.categoryName)) groups.set(f.categoryName, []);
    groups.get(f.categoryName)!.push(f);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (catOrder.get(a[0]) ?? 999) - (catOrder.get(b[0]) ?? 999)
  );

  const itemImage = (it: ConcertItem) => warehouseItems.find((w) => w.id === it.itemId)?.imageUrl ?? null;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          div[class*="mr-64"] { margin-right: 0 !important; }
          body { background: white !important; }
          #kitchen-sheet { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-4">
        {/* Controls */}
        <div className="no-print flex items-center gap-2 flex-wrap">
          <Link href="/kitchen" className="flex items-center gap-1 text-sm text-[#1C2D50] font-semibold">
            <ChevronRight size={16} /> العودة للطلبات
          </Link>
          <div className="mr-auto flex gap-2">
            {order?.status === "sent" && canConfirm && (
              <Button variant="success" size="sm" loading={confirming} onClick={handleConfirm}>
                <CheckCircle2 size={14} /> تأكيد الاستلام
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()}>
              <Printer size={14} /> طباعة
            </Button>
          </div>
        </div>

        {/* Printable sheet */}
        <div id="kitchen-sheet" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-[#1C2D50] text-white px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-base">طلب مطبخ — حفلة #{concert.concertNumber}</p>
              <p className="text-xs opacity-75 mt-0.5">مطعم الفريج لتقديم الوجبات</p>
            </div>
            <UtensilsCrossed size={26} className="opacity-60" />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 px-5 py-3 border-b border-slate-100 text-sm">
            <div>
              <p className="text-[11px] text-slate-400">اسم العميل</p>
              <p className="font-bold text-slate-800">{concert.clientName}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">تاريخ الحفلة</p>
              <p className="font-bold text-slate-800 tabular-nums-auto">{formatDate(concert.date)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">المكان</p>
              <p className="font-bold text-slate-800">{concert.venueName || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">وقت الإرسال</p>
              <p className="font-bold text-slate-800 tabular-nums-auto">{order ? formatDateTime(order.sentAt) : "—"}</p>
            </div>
          </div>

          {/* Food */}
          <div className="px-5 py-3">
            <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
              <UtensilsCrossed size={13} className="text-orange-500" />
              الأقسام والأصناف
            </p>
            {sortedGroups.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد أصناف أكل</p>
            ) : (
              <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-[#1C2D50] text-white">
                    <th className="text-right px-3 py-1.5 text-xs font-semibold">الصنف</th>
                    <th className="text-center px-3 py-1.5 text-xs font-semibold w-24">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map(([catName, catFood]) => (
                    <Fragment key={catName}>
                      <tr className="bg-slate-100">
                        <td colSpan={2} className="px-3 py-1.5 font-bold text-[#1C2D50] text-xs border-t border-slate-200">
                          {catName} ({catFood.reduce((s, f) => s + (f.quantity ?? 0), 0)})
                        </td>
                      </tr>
                      {catFood.map((f) => (
                        <tr key={f.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700">
                            {f.selectedOption}
                            {f.notes && <span className="text-xs text-slate-400"> — {f.notes}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-center font-bold text-slate-800 tabular-nums-auto">
                            {f.quantity ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Materials */}
          <div className="px-5 py-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
              <Package size={13} className="text-indigo-500" />
              المواد المستعملة
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد مواد</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map((it) => {
                  const img = itemImage(it);
                  return (
                    <div key={it.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-2">
                      {img && (
                        <img
                          src={thumbUrl(img, 100)}
                          alt={it.itemName}
                          className="w-9 h-9 object-cover rounded-md border border-slate-100 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{it.itemName}</p>
                        <p className="text-[11px] text-slate-500">الكمية: <span className="font-bold text-slate-700">{it.count}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          {concert.notes && (
            <div className="px-5 py-3 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-500 mb-1.5">ملاحظات</p>
              <p className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{concert.notes}</p>
            </div>
          )}

          {/* Receipt status */}
          <div className={`px-5 py-2.5 text-xs font-semibold border-t ${
            order?.status === "received"
              ? "bg-green-50 text-green-700 border-green-100"
              : "bg-amber-50 text-amber-700 border-amber-100"
          }`}>
            {order?.status === "received"
              ? `✓ تم تأكيد الاستلام${order.receivedBy ? ` بواسطة ${order.receivedBy}` : ""}${order.receivedAt ? ` — ${formatDateTime(order.receivedAt)}` : ""}`
              : "بانتظار تأكيد الاستلام من المطبخ"}
          </div>
        </div>
      </div>
    </>
  );
}
