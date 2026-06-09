"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getConcertById, getConcertItems, updateConcertItem,
  approveDelivery, approveReturn, setConcertLocation, supervisorDeliverToWarehouse
} from "@/lib/firestore/concerts";
import { getConcertFood } from "@/lib/firestore/food";
import { createRequest, getRequestsByConcert } from "@/lib/firestore/requests";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUserById } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Concert, ConcertItem, AppUser, WarehouseItem, WarehouseRequest, ConcertFood } from "@/types";
import { formatDate } from "@/lib/utils";
import { Calendar, Plus, Package, ChevronRight, CheckCircle, MapPin, Phone, UserRound, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const LocationViewerDynamic = dynamic(
  () => import("@/components/map/LocationViewer").then((m) => m.LocationViewer),
  { ssr: false, loading: () => <div className="h-[260px] bg-slate-100 rounded-xl animate-pulse" /> }
);

const LocationPickerDynamic = dynamic(
  () => import("@/components/map/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-[300px] bg-slate-100 rounded-xl animate-pulse" /> }
);

interface Location { lat: number; lng: number; address: string; }

export default function SupervisorConcertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { appUser } = useAuth();
  const { showToast } = useToast();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [concertFood, setConcertFood] = useState<ConcertFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ConcertItem | null>(null);
  const [confirmDelivery, setConfirmDelivery] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmDeliverToWarehouse, setConfirmDeliverToWarehouse] = useState(false);

  const [requestForm, setRequestForm] = useState({ itemId: "", count: "1" });
  const [assignEmployeeId, setAssignEmployeeId] = useState("");

  // Location setting by supervisor
  const [supervisorLocation, setSupervisorLocation] = useState<Location | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => { if (id) loadData(); }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [concertData, itemsData, requestsData, warehouseData, foodData] = await Promise.all([
        getConcertById(id),
        getConcertItems(id),
        getRequestsByConcert(id),
        getWarehouseItems(),
        getConcertFood(id),
      ]);
      setConcert(concertData);
      setItems(itemsData);
      setRequests(requestsData);
      setWarehouseItems(warehouseData);
      setConcertFood(foodData);

      if (concertData) {
        const empData = await Promise.all(concertData.employeeIds.map((uid) => getUserById(uid)));
        setEmployees(empData.filter(Boolean) as AppUser[]);
      }
    } catch {
      showToast("حدث خطأ أثناء تحميل البيانات", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveLocation() {
    if (!supervisorLocation) { showToast("يرجى تحديد الموقع على الخريطة", "error"); return; }
    setSavingLocation(true);
    try {
      await setConcertLocation(id, supervisorLocation);
      showToast("تم تحديد موقع الحفلة بنجاح");
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSavingLocation(false); }
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !concert) return;
    const item = warehouseItems.find((i) => i.id === requestForm.itemId);
    if (!item) return;
    setSaving(true);
    try {
      await createRequest({
        concertId: id,
        concertName: concert.name,
        supervisorId: appUser.uid,
        supervisorName: appUser.name,
        itemId: item.id,
        itemName: item.name,
        type: item.type,
        requestedCount: parseInt(requestForm.count),
      });
      showToast("تم إرسال طلب المادة إلى مدير المخازن");
      setShowRequestForm(false);
      setRequestForm({ itemId: "", count: "1" });
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTarget || !assignEmployeeId) return;
    const emp = employees.find((e) => e.uid === assignEmployeeId);
    if (!emp) return;
    setSaving(true);
    try {
      await updateConcertItem(assignTarget.id, {
        assignedToEmployeeId: assignEmployeeId,
        assignedToEmployeeName: emp.name,
      });
      showToast(`تم إسناد "${assignTarget.itemName}" إلى ${emp.name}`);
      setShowAssignModal(false);
      setAssignTarget(null);
      setAssignEmployeeId("");
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleApproveDelivery() {
    if (!appUser) return;
    setSaving(true);
    try {
      await approveDelivery(id, appUser.uid);
      showToast("تم استلام المواد من المخزن — حدد موقع الحفلة");
      setConfirmDelivery(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleApproveReturn() {
    if (!appUser) return;
    setSaving(true);
    try {
      await approveReturn(id, appUser.uid);
      showToast("تم استلام المواد من الحفلة — الخطوة التالية: تسليمها للمخزن");
      setConfirmReturn(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleDeliverToWarehouse() {
    if (!appUser) return;
    setSaving(true);
    try {
      await supervisorDeliverToWarehouse(id, appUser.uid);
      showToast("تم تسليم المواد إلى المخزن — بانتظار تأكيد مدير المخازن");
      setConfirmDeliverToWarehouse(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" /></div>;
  }

  if (!concert) {
    return <div className="text-center py-12 text-slate-400">الحفلة غير موجودة</div>;
  }

  const isLocked = concert.deliveryApproved;
  const needsLocation = concert.deliveryApproved && !concert.location;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/supervisor/concerts" className="hover:text-blue-600">حفلاتي</Link>
        <ChevronRight size={14} />
        <span className="text-slate-800 font-medium">{concert.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{concert.name}</h2>
          <StatusBadge status={concert.status} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {!concert.deliveryApproved && (
            <Button variant="success" onClick={() => setConfirmDelivery(true)}>
              <CheckCircle size={16} />
              تم استلام الحفل والمواد من المخزن
            </Button>
          )}
          {concert.deliveryApproved && concert.location && !concert.returnApproved && (
            <Button variant="success" onClick={() => setConfirmReturn(true)}>
              <CheckCircle size={16} />
              تم استلام المواد من الحفلة
            </Button>
          )}
          {concert.returnApproved && !concert.supervisorDeliveredToWarehouse && (
            <Button onClick={() => setConfirmDeliverToWarehouse(true)}>
              <CheckCircle size={16} />
              تم تسليم المواد إلى المخزن
            </Button>
          )}
          {concert.supervisorDeliveredToWarehouse && (
            <button disabled className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-200 text-slate-400 cursor-not-allowed">
              <CheckCircle size={16} />
              {concert.warehouseReturnConfirmed ? "تم تأكيد الاستلام من المخزن ✓" : "بانتظار تأكيد مدير المخازن..."}
            </button>
          )}
        </div>
      </div>

      {/* Date */}
      <Card>
        <div className="flex items-center gap-2 text-slate-500 mb-1">
          <Calendar size={14} />
          <span className="text-xs font-medium">التاريخ</span>
        </div>
        <p className="font-semibold text-slate-800 text-sm">{formatDate(concert.date)}</p>
      </Card>

      {/* Client Info */}
      {(concert.clientName || concert.clientPhone || concert.clientPhone2) && (
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-3">
            <UserRound size={15} />
            <span className="text-sm font-bold text-slate-700">بيانات العميل</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {concert.clientName && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">اسم العميل</p>
                <p className="font-semibold text-slate-800 text-sm">{concert.clientName}</p>
              </div>
            )}
            {concert.clientPhone && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">رقم الجوال</p>
                <a href={`tel:${concert.clientPhone}`} className="font-semibold text-blue-700 text-sm flex items-center gap-1 hover:underline">
                  <Phone size={13} />
                  {concert.clientPhone}
                </a>
              </div>
            )}
            {concert.clientPhone2 && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">رقم الجوال الثاني</p>
                <a href={`tel:${concert.clientPhone2}`} className="font-semibold text-blue-700 text-sm flex items-center gap-1 hover:underline">
                  <Phone size={13} />
                  {concert.clientPhone2}
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Location */}
      {concert.location ? (
        <Card>
          <h3 className="font-bold text-slate-800 mb-3">موقع الحفلة</h3>
          <LocationViewerDynamic location={concert.location} />
        </Card>
      ) : needsLocation ? (
        /* Supervisor sets location after receiving items */
        <Card className="border-blue-200 bg-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={18} className="text-blue-600" />
            <h3 className="font-bold text-blue-800">تحديد موقع الحفلة</h3>
          </div>
          <p className="text-sm text-blue-600 mb-4">
            لم يحدد المدير موقع الحفلة — حدد الموقع الذي أنزلت فيه المواد
          </p>
          <LocationPickerDynamic value={supervisorLocation} onChange={setSupervisorLocation} />
          <div className="mt-4">
            <Button
              onClick={handleSaveLocation}
              loading={savingLocation}
              disabled={!supervisorLocation}
              className="w-full"
            >
              <MapPin size={16} />
              تأكيد موقع الحفلة
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Approval Status */}
      <Card className={concert.deliveryApproved ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
        <div className="flex items-center gap-2">
          <CheckCircle size={18} className={concert.deliveryApproved ? "text-green-600" : "text-yellow-500"} />
          <div>
            <p className="font-semibold text-sm">
              {concert.deliveryApproved ? "تم استلام المواد من المخزن — أنت مسؤول عنها" : "في انتظار استلام المواد من المخزن"}
            </p>
            {concert.returnApproved && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم استلام المواد من الحفلة</p>
            )}
            {concert.supervisorDeliveredToWarehouse && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم تسليم المواد إلى المخزن</p>
            )}
            {concert.supervisorDeliveredToWarehouse && (
              <p className="text-xs mt-0.5" style={{ color: concert.warehouseReturnConfirmed ? "#16a34a" : "#94a3b8" }}>
                {concert.warehouseReturnConfirmed
                  ? "✓ تم تأكيد استلامها من مدير المخازن"
                  : "⏳ بانتظار تأكيد مدير المخازن"}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Request Items */}
      {!isLocked && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">طلب مواد من المخزن</h3>
            <Button size="sm" onClick={() => setShowRequestForm(true)}>
              <Plus size={14} /> طلب مادة
            </Button>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-400">لم تطلب أي مواد بعد</p>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{req.itemName}</p>
                    <p className="text-xs text-slate-400">طلب: {req.requestedCount}</p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Concert Items */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Package size={16} />
          مواد الحفلة ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">لم تتم إضافة مواد بعد</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={item.type} />
                    {item.assignedToEmployeeName ? (
                      <span className="text-xs text-slate-500">مسند لـ: {item.assignedToEmployeeName}</span>
                    ) : (
                      <span className="text-xs text-red-400">غير مسند</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-blue-700">{item.count}</p>
                  <StatusBadge status={item.deliveryStatus} />
                  {!isLocked && employees.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => { setAssignTarget(item); setShowAssignModal(true); }}>
                      إسناد
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Employees */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-3">الموظفون ({employees.length})</h3>
        {employees.length === 0 ? (
          <p className="text-sm text-slate-400">لا يوجد موظفون في هذه الحفلة</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {employees.map((emp) => (
              <div key={emp.uid} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">{emp.name.charAt(0)}</div>
                <span className="text-sm text-slate-700">{emp.name}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Food Items */}
      {concertFood.length > 0 && (
        <Card>
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <UtensilsCrossed size={16} className="text-orange-500" />
            أصناف الأكل ({concertFood.length})
          </h3>
          <div className="space-y-2">
            {concertFood.map((f) => (
              <div key={f.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{f.categoryName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{f.selectedOption}</span>
                    {f.quantity && <span className="text-xs text-slate-400">الكمية: {f.quantity}</span>}
                    {f.notes && <span className="text-xs text-slate-400">— {f.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modals */}
      <Modal open={showRequestForm} onClose={() => setShowRequestForm(false)} title="طلب مادة من المخزن">
        <form onSubmit={handleRequest} className="space-y-4">
          <Select label="المادة" value={requestForm.itemId} onChange={(e) => setRequestForm({ ...requestForm, itemId: e.target.value })} required placeholder="اختر مادة...">
            {warehouseItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.type === "internal" ? "داخلي" : "خارجي"}) — متوفر: {item.availableCount}
              </option>
            ))}
          </Select>
          <Input label="العدد المطلوب" type="number" min={1} value={requestForm.count} onChange={(e) => setRequestForm({ ...requestForm, count: e.target.value })} required />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowRequestForm(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>إرسال الطلب</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showAssignModal} onClose={() => { setShowAssignModal(false); setAssignTarget(null); }} title={`إسناد "${assignTarget?.itemName}"`}>
        <form onSubmit={handleAssign} className="space-y-4">
          <Select label="اختر الموظف" value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)} required placeholder="اختر موظفاً...">
            {employees.map((emp) => (
              <option key={emp.uid} value={emp.uid}>{emp.name}</option>
            ))}
          </Select>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => { setShowAssignModal(false); setAssignTarget(null); }}>إلغاء</Button>
            <Button type="submit" loading={saving}>إسناد</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirmDelivery}
        onClose={() => setConfirmDelivery(false)}
        onConfirm={handleApproveDelivery}
        title="تم استلام الحفل والمواد من المخزن"
        message="بتأكيدك هذا تؤكد استلام جميع المواد من المخزن وتصبح مسؤولاً عنها. بعد التأكيد ستحتاج لتحديد موقع الحفلة."
        confirmLabel="نعم، تم الاستلام من المخزن"
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        open={confirmReturn}
        onClose={() => setConfirmReturn(false)}
        onConfirm={handleApproveReturn}
        title="تم استلام المواد من الحفلة"
        message="بتأكيدك هذا تؤكد استلامك جميع المواد من موظفي الحفلة. الخطوة التالية: تسليمها إلى المخزن."
        confirmLabel="نعم، تم الاستلام من الحفلة"
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        open={confirmDeliverToWarehouse}
        onClose={() => setConfirmDeliverToWarehouse(false)}
        onConfirm={handleDeliverToWarehouse}
        title="تم تسليم المواد إلى المخزن"
        message="بتأكيدك هذا تؤكد تسليم جميع المواد إلى مدير المخازن. سيقوم بتأكيد الاستلام وإضافتها للمخزن."
        confirmLabel="نعم، تم التسليم للمخزن"
        variant="primary"
        loading={saving}
      />
    </div>
  );
}
