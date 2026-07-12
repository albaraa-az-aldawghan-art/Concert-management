"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getKitchenOrders, confirmKitchenOrder } from "@/lib/firestore/kitchen";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KitchenOrder } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { UtensilsCrossed, Printer, CheckCircle2, Clock } from "lucide-react";

export default function KitchenPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setOrders(await getKitchenOrders());
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(order: KitchenOrder) {
    if (!appUser) return;
    setConfirmingId(order.id);
    try {
      await confirmKitchenOrder(order.id, appUser.name);
      showToast("تم تأكيد استلام الحفلة");
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  if (appUser && appUser.role !== "kitchen" && appUser.role !== "admin") {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const pending = orders.filter((o) => o.status === "sent");
  const received = orders.filter((o) => o.status === "received");

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
          {order.venueName && (
            <div className="flex justify-between">
              <span className="text-slate-500">المكان</span>
              <span className="font-semibold text-slate-800">{order.venueName}</span>
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

        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <Link href={`/kitchen/${order.concertId}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Printer size={14} /> عرض وطباعة
            </Button>
          </Link>
          {isPending && (
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
        <h2 className="text-xl font-bold text-slate-800">طلبات المطبخ</h2>
        <p className="text-sm text-slate-500">
          {pending.length} بانتظار الاستلام · {received.length} مستلمة
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <UtensilsCrossed size={40} className="mb-3 opacity-40" />
          <p>لم تُرسل أي حفلات للمطبخ بعد</p>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-amber-700 mb-3">بانتظار الاستلام</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {pending.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}
          {received.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-3">المستلمة</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {received.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
