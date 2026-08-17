"use client";

/* طلبات الموارد: حفلات تنتظر تسليم موادها أو استلامها. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getWarehouseOrders, confirmWarehouseOrder } from "@/lib/firestore/kitchen";
import { getConcerts, confirmWarehouseReturn } from "@/lib/firestore/concerts";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KitchenOrder, Concert } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { Package, Printer, CheckCircle2, Clock, PackageCheck, Check } from "lucide-react";

const PAGE_SIZE = 10;

export default function WarehouseOrdersPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [pendingReturn, setPendingReturn] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [statusF, setStatusF] = useState<"" | "sent" | "received">("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, dateF, statusF]);

  /* لا استثناء بالاسم: الدور مستند تُعدَّل صلاحياته، ونزعُ إجراء منه يجب
     أن يمنعه فعلاً — وإلا كان الكتالوج زينة */
  const allowed = can("warehouse_orders");
  const canConfirm = feat("warehouse_orders", "confirm");
  const canConfirmReturn = feat("warehouse_orders", "confirm_return");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // قائمة الطلبات لا تنتظر قائمة المرتجعات — تُحمَّلان معاً
      const [ord, concerts] = await Promise.all([
        getWarehouseOrders(),
        getConcerts().catch(() => [] as Concert[]),
      ]);
      setOrders(ord);
      setPendingReturn(
        concerts.filter((c) => c.supervisorDeliveredToWarehouse && !c.warehouseReturnConfirmed)
      );
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReturn(concert: Concert) {
    if (!appUser) return;
    setConfirmingId(concert.id);
    try {
      await confirmWarehouseReturn(concert.id, appUser.uid);
      showToast(`تم استلام مواد "${concert.name}" وإعادتها للرصيد`);
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleConfirm(order: KitchenOrder) {
    if (!appUser) return;
    setConfirmingId(order.id);
    try {
      await confirmWarehouseOrder(order.id);
      showToast("تم تأكيد استلام الحفلة");
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  if (appUser && !allowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const pending = orders.filter((o) => o.status === "sent");
  const received = orders.filter((o) => o.status === "received");

  const q = search.trim().toLowerCase();
  const numQ = search.trim().replace(/^#/, "");
  const filtered = orders.filter(
    (o) =>
      (!statusF || o.status === statusF) &&
      matchesDate(o.concertDate, dateF) &&
      (!q ||
        o.clientName.toLowerCase().includes(q) ||
        (o.venueName ?? "").toLowerCase().includes(q) ||
        String(o.concertNumber).padStart(3, "0").includes(numQ))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function OrderCard({ order }: { order: KitchenOrder }) {
    const isPending = order.status === "sent";
    return (
      <Card className={isPending ? "border-amber-200" : ""}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-800 truncate">{order.clientName}</p>
            <p className="text-xs text-slate-400 mt-0.5">حفلة #{order.concertNumber}</p>
          </div>
          {isPending ? (
            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
              <Clock size={11} /> بانتظار الاستلام
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
              <CheckCircle2 size={11} /> تم الاستلام
            </span>
          )}
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">تاريخ الحفلة</span>
            <span className="font-semibold text-slate-800 tabular-nums-auto">{formatDate(order.concertDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">وقت الحفلة</span>
            <span className="font-bold text-[#1C2D50] tabular-nums-auto">{formatTime(order.concertDate)}</span>
          </div>
          {order.venueName && (
            <div className="flex justify-between">
              <span className="text-slate-500">المكان</span>
              <span className="font-semibold text-slate-800">{order.venueName}</span>
            </div>
          )}
          {order.peopleCount && (
            <div className="flex justify-between">
              <span className="text-slate-500">عدد الأشخاص</span>
              <span className="font-semibold text-slate-800">{order.peopleCount}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">أُرسلت في</span>
            <span className="text-slate-600 tabular-nums-auto">{formatDateTime(order.sentAt)}</span>
          </div>
          {order.status === "received" && order.receivedAt && (
            <div className="flex justify-between">
              <span className="text-slate-500">استُلمت في</span>
              <span className="text-green-700 tabular-nums-auto">{formatDateTime(order.receivedAt)}</span>
            </div>
          )}
        </div>

        {order.note && (
          <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 mt-3 line-clamp-2">
            {order.note}
          </p>
        )}

        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <Link href={`/warehouse-manager/orders/${order.concertId}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Printer size={14} /> عرض وطباعة
            </Button>
          </Link>
          {isPending && canConfirm && (
            <Button
              size="sm"
              variant="success"
              className="flex-1"
              loading={confirmingId === order.id}
              onClick={() => handleConfirm(order)}
            >
              <CheckCircle2 size={14} /> تأكيد الاستلام
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">الموارد — الطلبات والمرتجعات</h2>
        <p className="text-sm text-slate-500">
          {pending.length} بانتظار الاستلام · {received.length} مستلمة
          {pendingReturn.length > 0 && ` · ${pendingReturn.length} مرتجع بانتظار التأكيد`}
        </p>
      </div>

      {/* مواد راجعة من الحفلات بانتظار تأكيد الاستلام — يختفي القسم إذا لم يوجد شيء */}
      {pendingReturn.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-orange-600" />
            <h3 className="font-bold text-slate-800">مواد بانتظار تأكيد استلامها من الحفلات</h3>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingReturn.length}
            </span>
          </div>
          {pendingReturn.map((concert) => (
            <Card key={concert.id} className="border-orange-200 bg-orange-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800">{concert.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سلّم المشرف المواد — بتأكيدك تُعاد الكميات للرصيد عدا المُبلَّغ عنه كمفقود
                  </p>
                </div>
                {canConfirmReturn && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleConfirmReturn(concert)}
                    loading={confirmingId === concert.id}
                    className="gap-1 shrink-0"
                  >
                    <Check size={14} />
                    تم استلام المواد
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="بحث برقم الحفلة، اسم العميل، أو المكان..."
      />

      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={filtered.length} unitLabel="حفلة" />

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "", label: "الكل", count: orders.length },
          { key: "sent", label: "بانتظار الاستلام", count: pending.length },
          { key: "received", label: "المستلمة", count: received.length },
        ] as { key: "" | "sent" | "received"; label: string; count: number }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusF(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusF === f.key
                ? "bg-[#1C2D50] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span className="mr-1.5 text-xs opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>{orders.length === 0 ? "لم تُرسل أي حفلات للموارد بعد" : "لا توجد نتائج مطابقة"}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
