"use client";

/* تفاصيل طلب المطبخ: أصناف الأكل وكمياتها وبيانات الحفلة، وطباعته. */
import { useEffect, useState } from "react";
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
import { generateElementPDF, downloadPdf, isMobileDevice } from "@/lib/pdf";
import { Concert, ConcertItem, ConcertFood, FoodCategory, WarehouseItem, KitchenOrder } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { Printer, CheckCircle2, ChevronRight, UtensilsCrossed, Package } from "lucide-react";

export default function KitchenSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canConfirm = feat("kitchen", "confirm");

  const [concert, setConcert] = useState<Concert | null>(null);
  const [food, setFood] = useState<ConcertFood[]>([]);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [order, setOrder] = useState<KitchenOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Scale the fixed-width sheet down to fit small screens (preview only)
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const calc = () => setZoom(Math.min(1, (window.innerWidth - 40) / 733));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // Desktop: native print dialog. Mobile (esp. iOS where window.print takes
  // ~60s): generate a PDF fast and open the share sheet (Print/Save inside).
  async function handlePrint() {
    if (!isMobileDevice()) {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const el = document.getElementById("kitchen-sheet");
      if (!el) throw new Error("sheet not found");
      const blob = await generateElementPDF(el);
      downloadPdf(blob, `مطبخ-حفلة-${concert?.concertNumber ?? ""}.pdf`);
    } catch (err) {
      alert("خطأ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPrinting(false);
    }
  }

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
          #kitchen-sheet {
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Keep each category block and material card whole on one page */
          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .sheet-zoom { zoom: 1 !important; }
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
            <Button size="sm" loading={printing} onClick={handlePrint}>
              <Printer size={14} /> طباعة
            </Button>
          </div>
        </div>

        {/* Printable sheet — FIXED 733px width, zoom-scaled to fit the screen */}
        <div className="sheet-zoom pb-2" style={{ zoom } as React.CSSProperties}>
        <div id="kitchen-sheet" style={{ width: 733 }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-[#1C2D50] text-white px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-base">طلب مطبخ — حفلة #{concert.concertNumber}</p>
              <p className="text-xs opacity-75 mt-0.5">مطعم الفريج لتقديم الوجبات</p>
            </div>
            <UtensilsCrossed size={26} className="opacity-60" />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-4 gap-x-4 gap-y-2 px-5 py-3 border-b border-slate-100 text-sm">
            <div>
              <p className="text-[11px] text-slate-400">اسم العميل</p>
              <p className="font-bold text-slate-800">{concert.clientName}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">تاريخ الحفلة ووقتها</p>
              <p className="font-bold text-slate-800 tabular-nums-auto">{formatDate(concert.date)}</p>
              <p className="font-bold text-[#1C2D50] tabular-nums-auto">🕐 {formatTime(concert.date)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">المكان</p>
              <p className="font-bold text-slate-800">{concert.venueName || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">وقت الإرسال</p>
              <p className="font-bold text-slate-800 tabular-nums-auto">{order ? formatDateTime(order.sentAt) : "—"}</p>
            </div>
            {concert.peopleCount && (
              <div>
                <p className="text-[11px] text-slate-400">عدد الأشخاص</p>
                <p className="font-bold text-slate-800">👥 {concert.peopleCount}</p>
              </div>
            )}
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
              <div className="space-y-2.5">
                {sortedGroups.map(([catName, catFood]) => (
                  <div key={catName} className="avoid-break">
                    {/* Category header */}
                    <span className="inline-block bg-[#1C2D50] text-white text-[12px] font-bold px-2.5 py-0.5 rounded-md">
                      {catName}
                      <span className="opacity-75 font-medium"> ({catFood.reduce((s, f) => s + (f.quantity ?? 0), 0)})</span>
                    </span>
                    {/* Items inline: "option ×qty ، option ×qty ، ..."
                        The separator lives OUTSIDE the nowrap span so the line
                        can wrap between items instead of overflowing off-page */}
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
                          {f.notes && <span className="text-[11px] text-slate-400"> ({f.notes})</span>}{" "}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materials — grouped internal/external, image-top photo cards */}
          <div className="px-5 py-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
              <Package size={13} className="text-indigo-500" />
              المواد المستعملة
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد مواد</p>
            ) : (
              <div className="space-y-3">
                {([
                  { label: "داخلية", list: items.filter((i) => i.type === "internal") },
                  { label: "خارجية", list: items.filter((i) => i.type === "external") },
                ] as const).filter((g) => g.list.length > 0).map((group) => (
                  <div key={group.label} className="avoid-break">
                    <span className="inline-block bg-slate-100 text-slate-600 text-[11px] font-bold px-2.5 py-0.5 rounded-md mb-1.5">
                      {group.label} ({group.list.length})
                    </span>
                    <div className="grid grid-cols-6 gap-1.5">
                      {group.list.map((it) => {
                        const img = itemImage(it);
                        return (
                          <div key={it.id} className="avoid-break border border-slate-200 rounded-lg p-1 flex flex-col items-center text-center">
                            {img ? (
                              <img
                                src={thumbUrl(img, 160)}
                                alt={it.itemName}
                                loading="lazy"
                                className="w-full aspect-square object-cover rounded-md border border-slate-100"
                              />
                            ) : (
                              <div className="w-full aspect-square rounded-md bg-slate-50 flex items-center justify-center">
                                <Package size={18} className="text-slate-300" />
                              </div>
                            )}
                            <p className="text-[10px] font-bold text-slate-800 mt-1 leading-tight">{it.itemName}</p>
                            <p className="text-[10px] text-slate-500 tabular-nums-auto">
                              الكمية: <b className="text-[#1C2D50]">{it.count}</b>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
      </div>
    </>
  );
}
