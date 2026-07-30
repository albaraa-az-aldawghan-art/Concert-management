"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllRequests, approveRequest, rejectRequest } from "@/lib/firestore/requests";
import { getConcerts, confirmWarehouseReturn } from "@/lib/firestore/concerts";
import { decreaseAvailableCount } from "@/lib/firestore/warehouse";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { WarehouseRequest, Concert } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { ClipboardList, Check, X, PackageCheck } from "lucide-react";

const PAGE_SIZE = 10;

export default function WarehouseRequestsPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isStaff = appUser?.role === "warehouse_manager" || appUser?.role === "admin";
  const pageAllowed = isStaff || (appUser?.role === "custom" && can("requests"));
  const canApprove = isStaff || feat("requests", "approve");
  const canReject = isStaff || feat("requests", "reject");
  const canConfirmReturn = isStaff || feat("requests", "confirm_return");
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [pendingReturn, setPendingReturn] = useState<Concert[]>([]);
  const [concertDates, setConcertDates] = useState<Map<string, unknown>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [filterStatus, search, dateF]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [reqs, concerts] = await Promise.all([getAllRequests(), getConcerts()]);
      setRequests(reqs);
      setPendingReturn(concerts.filter((c) => c.supervisorDeliveredToWarehouse && !c.warehouseReturnConfirmed));
      setConcertDates(new Map(concerts.map((c) => [c.id, c.date])));
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(req: WarehouseRequest) {
    if (!appUser) return;
    setSaving(req.id);
    try {
      await decreaseAvailableCount(req.itemId, req.requestedCount);
      await approveRequest(req.id, appUser.uid);
      showToast("تمت الموافقة وتم صرف المواد من الموارد");
      loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      showToast(msg, "error");
    } finally { setSaving(null); }
  }

  async function handleReject(req: WarehouseRequest) {
    if (!appUser) return;
    setSaving(req.id);
    try {
      await rejectRequest(req.id, appUser.uid);
      showToast("تم رفض الطلب");
      loadAll();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(null); }
  }

  async function handleConfirmReturn(concert: Concert) {
    if (!appUser) return;
    setSaving(concert.id);
    try {
      await confirmWarehouseReturn(concert.id, appUser.uid);
      showToast(`تم استلام مواد "${concert.name}" وإضافتها للموارد — أنت مسؤول عنها الآن`);
      loadAll();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(null); }
  }

  const q = search.trim().toLowerCase();
  const filtered = requests.filter(
    (r) =>
      (!filterStatus || r.status === filterStatus) &&
      matchesDate(concertDates.get(r.concertId) ?? r.createdAt, dateF) &&
      (!q ||
        r.itemName.toLowerCase().includes(q) ||
        r.concertName.toLowerCase().includes(q) ||
        r.supervisorName.toLowerCase().includes(q))
  );
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">طلبات المواد</h2>
        <p className="text-sm text-slate-500">{pendingCount} طلب معلق</p>
      </div>

      {/* Pending warehouse return confirmations */}
      {pendingReturn.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-orange-600" />
            <h3 className="font-bold text-slate-800">مواد بانتظار تأكيد استلامها من الحفلات</h3>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendingReturn.length}</span>
          </div>
          {pendingReturn.map((concert) => (
            <Card key={concert.id} className="border-orange-200 bg-orange-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800">{concert.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سلّم المشرف المواد للموارد — بانتظار تأكيدك لإضافتها وتحمّل مسؤوليتها
                  </p>
                </div>
                {canConfirmReturn && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleConfirmReturn(concert)}
                    loading={saving === concert.id}
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
        placeholder="بحث باسم المادة، الحفلة، أو المشرف..."
      />

      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={filtered.length} unitLabel="طلب" />

      {/* Requests section */}
      <div className="flex gap-2 flex-wrap">
        {["pending", "approved", "rejected", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {s === "" ? "الكل" : s === "pending" ? "معلقة" : s === "approved" ? "مقبولة" : "مرفوضة"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <ClipboardList size={40} className="mb-3 opacity-40" />
          <p>{requests.length === 0 ? "لا توجد طلبات" : "لا توجد نتائج مطابقة"}</p>
        </Card>
      ) : (
        <>
        <div className="space-y-3">
          {paginated.map((req) => (
            <Card key={req.id} className={req.status === "pending" ? "border-yellow-200" : ""}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-800">{req.itemName}</p>
                    <StatusBadge status={req.type} />
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-sm text-slate-600">الحفلة: <span className="font-medium">{req.concertName}</span></p>
                  <p className="text-sm text-slate-600">المشرف: <span className="font-medium">{req.supervisorName}</span></p>
                  <p className="text-xs text-slate-400 mt-1">{formatDateTime(req.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[#1C2D50]">{req.requestedCount}</p>
                    <p className="text-xs text-slate-400">مطلوب</p>
                  </div>
                  {req.status === "pending" && (canApprove || canReject) && (
                    <div className="flex gap-2">
                      {canApprove && (
                        <Button variant="success" size="sm" onClick={() => handleApprove(req)} loading={saving === req.id} className="gap-1">
                          <Check size={14} /> قبول
                        </Button>
                      )}
                      {canReject && (
                        <Button variant="danger" size="sm" onClick={() => handleReject(req)} loading={saving === req.id} className="gap-1">
                          <X size={14} /> رفض
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
