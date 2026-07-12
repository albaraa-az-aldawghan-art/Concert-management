"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertsByEmployee, getConcerts, getConcertItems, confirmItemDelivery, confirmItemReturn, markItemHasMissing } from "@/lib/firestore/concerts";
import { getConcertById } from "@/lib/firestore/concerts";
import { reportMissingItem } from "@/lib/firestore/missing-items";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Concert, ConcertItem } from "@/types";
import { Package, CheckCircle, AlertTriangle } from "lucide-react";

interface ItemWithConcert extends ConcertItem {
  concertName: string;
}

export default function EmployeeAssignmentsPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<ItemWithConcert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");

  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingTarget, setMissingTarget] = useState<ItemWithConcert | null>(null);
  const [missingCount, setMissingCount] = useState("1");
  const [confirmDelivery, setConfirmDelivery] = useState<ItemWithConcert | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<ItemWithConcert | null>(null);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => { if (appUser) loadItems(); }, [appUser]);

  async function loadItems() {
    if (!appUser) return;
    setLoading(true);
    try {
      // Admin oversees every employee: all concerts, every assigned item.
      // Fetch all concerts' items IN PARALLEL — sequential was too slow.
      const concerts = isAdmin
        ? await getConcerts()
        : await getConcertsByEmployee(appUser.uid);
      const perConcert = await Promise.all(
        concerts.map((c) =>
          getConcertItems(c.id)
            .catch(() => [])
            .then((concertItems) =>
              concertItems
                .filter((i) =>
                  isAdmin ? i.assignedToEmployeeId != null : i.assignedToEmployeeId === appUser.uid
                )
                .map((i) => ({ ...i, concertName: c.name }))
            )
        )
      );
      setItems(perConcert.flat());
    } catch {
      showToast("حدث خطأ أثناء تحميل البيانات", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDelivery(item: ItemWithConcert) {
    setSaving(item.id);
    try {
      await confirmItemDelivery(item.id);
      showToast(`تم تأكيد تسليم "${item.itemName}"`);
      setConfirmDelivery(null);
      loadItems();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(null); }
  }

  async function handleConfirmReturn(item: ItemWithConcert) {
    setSaving(item.id);
    try {
      await confirmItemReturn(item.id);
      showToast(`تم تأكيد استلام "${item.itemName}"`);
      setConfirmReturn(null);
      loadItems();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(null); }
  }

  async function handleReportMissing(e: React.FormEvent) {
    e.preventDefault();
    if (!missingTarget || !appUser) return;
    const count = parseInt(missingCount);
    if (count <= 0 || count > missingTarget.count) {
      showToast("عدد غير صحيح", "error");
      return;
    }
    setSaving(missingTarget.id);
    try {
      await markItemHasMissing(missingTarget.id);
      await reportMissingItem({
        concertId: missingTarget.concertId,
        concertName: missingTarget.concertName,
        itemId: missingTarget.itemId,
        itemName: missingTarget.itemName,
        missingCount: count,
        type: missingTarget.type,
        reportedBy: appUser.uid,
        reportedByName: appUser.name,
      });
      showToast("تم الإبلاغ عن المفقودات");
      setShowMissingModal(false);
      setMissingTarget(null);
      setMissingCount("1");
      loadItems();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(null); }
  }

  const filtered = filterStatus
    ? items.filter((i) => {
        if (filterStatus === "delivery_pending") return i.deliveryStatus === "pending";
        if (filterStatus === "return_pending") return i.returnStatus === "pending";
        if (filterStatus === "confirmed") return i.deliveryStatus === "confirmed" && i.returnStatus === "confirmed";
        return true;
      })
    : items;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{isAdmin ? "إسنادات الموظفين" : "موادي"}</h2>
        <p className="text-sm text-slate-500">
          {items.length} {isAdmin ? "مادة مسندة للموظفين — صلاحيات الموظف الكاملة" : "مادة مسندة إليك"}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { value: "", label: "الكل" },
          { value: "delivery_pending", label: "الاستلام من المخزن" },
          { value: "return_pending", label: "الاستلام من الحفل" },
          { value: "confirmed", label: "مكتمل" },
        ].map((s) => (
          <button key={s.value} onClick={() => setFilterStatus(s.value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === s.value ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Package size={40} className="mb-3 opacity-40" />
          <p>لا توجد أغراض مسندة</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">{item.itemName}</h3>
                  <p className="text-xs text-slate-400 mb-2">
                    الحفلة: {item.concertName}
                    {isAdmin && item.assignedToEmployeeName && (
                      <span className="text-indigo-600 font-semibold"> · الموظف: {item.assignedToEmployeeName}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={item.type} />
                    <StatusBadge status={item.deliveryStatus} />
                    <StatusBadge status={item.returnStatus} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[#1C2D50]">{item.count}</p>
                    <p className="text-xs text-slate-400">وحدة</p>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {item.deliveryStatus === "pending" && (
                      <Button size="sm" variant="success" onClick={() => setConfirmDelivery(item)} loading={saving === item.id}>
                        <CheckCircle size={13} /> تأكيد التسليم
                      </Button>
                    )}
                    {item.deliveryStatus === "confirmed" && item.returnStatus === "pending" && (
                      <>
                        <Button size="sm" variant="success" onClick={() => setConfirmReturn(item)} loading={saving === item.id}>
                          <CheckCircle size={13} /> تأكيد الاستلام
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => { setMissingTarget(item); setShowMissingModal(true); }}>
                          <AlertTriangle size={13} /> إبلاغ عن مفقودات
                        </Button>
                      </>
                    )}
                    {item.returnStatus === "has_missing" && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                        ⚠️ تم الإبلاغ عن مفقودات
                      </span>
                    )}
                    {item.returnStatus === "confirmed" && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                        ✓ مكتمل
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Missing Modal */}
      <Modal open={showMissingModal} onClose={() => { setShowMissingModal(false); setMissingTarget(null); }} title="الإبلاغ عن مفقودات">
        <form onSubmit={handleReportMissing} className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-sm font-semibold text-slate-800">{missingTarget?.itemName}</p>
            <p className="text-xs text-slate-500">الإجمالي: {missingTarget?.count} وحدة</p>
          </div>
          <Input
            label="عدد المفقودات"
            type="number"
            min={1}
            max={missingTarget?.count}
            value={missingCount}
            onChange={(e) => setMissingCount(e.target.value)}
            required
            helperText={`أقصى عدد: ${missingTarget?.count}`}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => { setShowMissingModal(false); setMissingTarget(null); }}>إلغاء</Button>
            <Button variant="danger" type="submit" loading={!!saving}>إبلاغ</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDelivery}
        onClose={() => setConfirmDelivery(null)}
        onConfirm={() => confirmDelivery && handleConfirmDelivery(confirmDelivery)}
        title="تأكيد التسليم"
        message={`هل تؤكد استلام "${confirmDelivery?.itemName}" (${confirmDelivery?.count} وحدة) بشكل صحيح؟`}
        confirmLabel="نعم، تم الاستلام"
        variant="primary"
        loading={!!saving}
      />

      <ConfirmModal
        open={!!confirmReturn}
        onClose={() => setConfirmReturn(null)}
        onConfirm={() => confirmReturn && handleConfirmReturn(confirmReturn)}
        title="تأكيد الاستلام"
        message={`هل تؤكد إعادة "${confirmReturn?.itemName}" (${confirmReturn?.count} وحدة) بشكل كامل دون مفقودات؟`}
        confirmLabel="نعم، أعدتها كاملة"
        variant="primary"
        loading={!!saving}
      />
    </div>
  );
}
