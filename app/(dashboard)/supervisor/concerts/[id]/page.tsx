"use client";

/* تنفيذ الحفلة: استلام المواد وتحديد الموقع وبدء التنفيذ والإرجاع والإبلاغ عن المفقودات. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getConcertById, getConcertItems, updateConcertItem, updateConcert,
  approveDelivery, approveReturn, setConcertLocation, supervisorDeliverToWarehouse,
  advanceToExecuting, markItemHasMissing,
} from "@/lib/firestore/concerts";
import { reportMissingItem } from "@/lib/firestore/missing-items";
import { getConcertFood } from "@/lib/firestore/food";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUserById, getUsersByRole } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Concert, ConcertItem, AppUser, WarehouseItem, ConcertFood } from "@/types";
import { formatDate } from "@/lib/utils";
import { normalizeStatus, hasStartedExecuting } from "@/lib/concert-status";
import { Calendar, Plus, Package, ChevronRight, CheckCircle, MapPin, Phone, UserRound, UtensilsCrossed, AlertTriangle, UsersRound } from "lucide-react";
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
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [concertFood, setConcertFood] = useState<ConcertFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Concert-level employee assignment (checklist of ALL employees)
  const [allEmployees, setAllEmployees] = useState<AppUser[]>([]);
  const [showAssignEmployees, setShowAssignEmployees] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [confirmDelivery, setConfirmDelivery] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmDeliverToWarehouse, setConfirmDeliverToWarehouse] = useState(false);
  const [confirmExecuting, setConfirmExecuting] = useState(false);


  // Missing-item reporting (supervisor responsibility)
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingTarget, setMissingTarget] = useState<ConcertItem | null>(null);
  const [missingCount, setMissingCount] = useState("1");

  async function handleReportMissing(e: React.FormEvent) {
    e.preventDefault();
    if (!missingTarget || !appUser || !concert) return;
    const count = parseInt(missingCount);
    if (isNaN(count) || count <= 0 || count > missingTarget.count) {
      showToast("عدد غير صحيح", "error");
      return;
    }
    setSaving(true);
    try {
      await markItemHasMissing(missingTarget.id);
      await reportMissingItem({
        concertId: missingTarget.concertId,
        concertName: concert.name,
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
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  // Location setting by supervisor
  const [supervisorLocation, setSupervisorLocation] = useState<Location | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => { if (id) loadData(); }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [concertData, itemsData, warehouseData, foodData, allEmps] = await Promise.all([
        getConcertById(id),
        getConcertItems(id),
        getWarehouseItems(),
        getConcertFood(id),
        getUsersByRole("employee").catch(() => []),
      ]);
      setAllEmployees(allEmps);
      setConcert(concertData);
      setItems(itemsData);
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

  // Concert-level assignment: the selected employees see the WHOLE concert
  // (materials + food, read-only) in their "حفلاتي" page.
  async function handleAssignEmployees() {
    if (!concert) return;
    setSaving(true);
    try {
      await updateConcert(concert.id, { employeeIds: assignIds });
      showToast(assignIds.length > 0 ? `تم إسناد الحفلة لـ ${assignIds.length} موظف` : "تم تحديث الموظفين");
      setShowAssignEmployees(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleApproveDelivery() {
    if (!appUser) return;
    setSaving(true);
    try {
      await approveDelivery(id, appUser.uid);
      showToast("تم استلام المواد من الموارد — حدد موقع الحفلة");
      setConfirmDelivery(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleApproveReturn() {
    if (!appUser) return;
    setSaving(true);
    try {
      await approveReturn(id, appUser.uid);
      showToast("تم استلام المواد من الحفلة — الخطوة التالية: تسليمها للموارد");
      setConfirmReturn(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleDeliverToWarehouse() {
    if (!appUser) return;
    setSaving(true);
    try {
      await supervisorDeliverToWarehouse(id, appUser.uid);
      showToast("تم تسليم المواد إلى الموارد — بانتظار تأكيد مدير الموارد");
      setConfirmDeliverToWarehouse(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  async function handleAdvanceToExecuting() {
    if (!appUser) return;
    setSaving(true);
    try {
      await advanceToExecuting(id, appUser.uid);
      showToast("الحفلة في مرحلة التنفيذ — بالتوفيق!");
      setConfirmExecuting(false);
      loadData();
    } catch { showToast("حدث خطأ", "error"); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" /></div>;
  }

  if (!concert) {
    return <div className="text-center py-12 text-slate-400">الحفلة غير موجودة</div>;
  }

  // Page access + feature gating: real supervisors and admin get everything;
  // custom roles follow their granted "supervisor" checklist.
  const role = appUser?.role;
  const pageAllowed = role === "admin" || role === "supervisor" || (role === "custom" && can("supervisor"));
  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }
  const fxs = (k: string) =>
    role === "admin" || role === "supervisor" || feat("supervisor", k);

  /* خطوات التشغيل الخمس — تعتمد كلها على العلامات المحفوظة مع الحفلة
     لا على مرحلتها، فكل خطوة تُفتح فور اكتمال ما قبلها ولا تنفتح مرتين. */
  const started = hasStartedExecuting(concert);
  const isLocked = concert.deliveryApproved;
  const needsLocation = concert.deliveryApproved && !concert.location && fxs("set_location");
  const isPlanned = normalizeStatus(concert.status) === "planned";
  const isCancelled = normalizeStatus(concert.status) === "cancelled";

  const canReceiveMaterials  = fxs("receive_materials")  && !isCancelled && !isPlanned && !concert.deliveryApproved;
  const canStartExecuting    = fxs("start_executing")    && !isCancelled && concert.deliveryApproved && !!concert.location && !started;
  const canReturnMaterials   = fxs("return_materials")   && !isCancelled && started && !concert.returnApproved;
  const canDeliverToWarehouse= fxs("deliver_warehouse")  && !isCancelled && concert.returnApproved && !concert.supervisorDeliveredToWarehouse;
  const isWaitingWarehouse   = concert.supervisorDeliveredToWarehouse && !concert.warehouseReturnConfirmed;
  // الإبلاغ عن المفقودات متاح من بدء التنفيذ حتى يستلم المخزن المواد —
  // بعد الاستلام يكون المخزون قد أُعيد، فبلاغ متأخر يفسد الأرصدة.
  const canReportMissing = fxs("report_missing") && started && !concert.warehouseReturnConfirmed;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/supervisor/concerts" className="hover:text-[#1C2D50]">حفلاتي</Link>
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
          {canReceiveMaterials && (
            <Button variant="success" onClick={() => setConfirmDelivery(true)}>
              <CheckCircle size={16} />
              تم استلام المواد من الموارد
            </Button>
          )}
          {canStartExecuting && (
            <Button variant="success" onClick={() => setConfirmExecuting(true)}>
              <CheckCircle size={16} />
              بدء تنفيذ الحفلة
            </Button>
          )}
          {canReturnMaterials && (
            <Button variant="success" onClick={() => setConfirmReturn(true)}>
              <CheckCircle size={16} />
              تم استلام المواد من الحفلة
            </Button>
          )}
          {canDeliverToWarehouse && (
            <Button onClick={() => setConfirmDeliverToWarehouse(true)}>
              <CheckCircle size={16} />
              تم تسليم المواد إلى الموارد
            </Button>
          )}
          {isWaitingWarehouse && (
            <button disabled className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-200 text-slate-400 cursor-not-allowed">
              <CheckCircle size={16} />
              {concert.warehouseReturnConfirmed ? "تم تأكيد الاستلام من الموارد ✓" : "بانتظار تأكيد مدير الموارد..."}
            </button>
          )}
        </div>
      </div>

      {/* Unconfirmed banner */}
      {isPlanned && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-yellow-500 mt-0.5 text-lg">⚠</span>
          <div>
            <p className="font-semibold text-yellow-800 text-sm">الحفلة في انتظار تأكيد الدفعة الأولى</p>
            <p className="text-xs text-yellow-600 mt-0.5">لا يمكن اتخاذ أي إجراء حتى يُسجّل المدير الدفعة الأولى</p>
          </div>
        </div>
      )}

      {/* Date + People Count */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Calendar size={14} />
              <span className="text-xs font-medium">التاريخ</span>
            </div>
            <p className="font-semibold text-slate-800 text-sm">{formatDate(concert.date)}</p>
          </div>
          {concert.peopleCount && (
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <UsersRound size={14} />
                <span className="text-xs font-medium">عدد الأشخاص</span>
              </div>
              <p className="font-semibold text-slate-800 text-sm">{concert.peopleCount}</p>
            </div>
          )}
        </div>
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
                <a href={`tel:${concert.clientPhone}`} className="font-semibold text-[#1C2D50] text-sm flex items-center gap-1 hover:underline">
                  <Phone size={13} />
                  {concert.clientPhone}
                </a>
              </div>
            )}
            {concert.clientPhone2 && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">رقم الجوال الثاني</p>
                <a href={`tel:${concert.clientPhone2}`} className="font-semibold text-[#1C2D50] text-sm flex items-center gap-1 hover:underline">
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
        <Card className="border-[#D4DCE8] bg-[#EEF1F7]">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={18} className="text-[#1C2D50]" />
            <h3 className="font-bold text-blue-800">تحديد موقع الحفلة</h3>
          </div>
          <p className="text-sm text-[#1C2D50] mb-4">
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
              {concert.deliveryApproved ? "تم استلام المواد من الموارد — أنت مسؤول عنها" : "في انتظار استلام المواد من الموارد"}
            </p>
            {concert.returnApproved && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم استلام المواد من الحفلة</p>
            )}
            {concert.supervisorDeliveredToWarehouse && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم تسليم المواد إلى الموارد</p>
            )}
            {concert.supervisorDeliveredToWarehouse && (
              <p className="text-xs mt-0.5" style={{ color: concert.warehouseReturnConfirmed ? "#16a34a" : "#94a3b8" }}>
                {concert.warehouseReturnConfirmed
                  ? "✓ تم تأكيد استلامها من مدير الموارد"
                  : "⏳ بانتظار تأكيد مدير الموارد"}
              </p>
            )}
          </div>
        </div>
      </Card>

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
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <p className="text-lg font-bold text-[#1C2D50]">{item.count}</p>
                  <StatusBadge status={item.deliveryStatus} />
                  {/* Missing reports only make sense while receiving materials
                      back from the concert */}
                  {item.returnStatus === "has_missing" ? (
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                      ⚠️ به مفقودات
                    </span>
                  ) : canReportMissing ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => { setMissingTarget(item); setMissingCount("1"); setShowMissingModal(true); }}
                    >
                      <AlertTriangle size={13} /> مفقودات
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Missing report modal */}
      <Modal
        open={showMissingModal}
        onClose={() => { setShowMissingModal(false); setMissingTarget(null); }}
        title="الإبلاغ عن مفقودات"
      >
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
            <Button variant="danger" type="submit" loading={saving}>إبلاغ</Button>
          </div>
        </form>
      </Modal>

      {/* Employees */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">الموظفون ({employees.length})</h3>
          {fxs("assign_employees") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setAssignIds(concert.employeeIds ?? []); setShowAssignEmployees(true); }}
            >
              <UserRound size={13} /> إسناد الموظفين
            </Button>
          )}
        </div>
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

      {/* Concert-level employee assignment — checklist of all employees */}
      <Modal open={showAssignEmployees} onClose={() => setShowAssignEmployees(false)} title="إسناد الحفلة للموظفين">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            الموظفون المحددون ستظهر لهم الحفلة كاملة (المواد وأصناف الأكل) للاطلاع فقط
          </p>
          {allEmployees.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">لا يوجد موظفون في النظام</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {allEmployees.map((emp) => {
                const checked = assignIds.includes(emp.uid);
                return (
                  <label
                    key={emp.uid}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? "bg-[#EEF1F7]" : "hover:bg-slate-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAssignIds((prev) =>
                          checked ? prev.filter((id) => id !== emp.uid) : [...prev, emp.uid]
                        )
                      }
                      className="accent-[#1C2D50] cursor-pointer"
                      style={{ width: 16, height: 16 }}
                    />
                    <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold shrink-0">
                      {emp.name.charAt(0)}
                    </span>
                    <span className={`text-sm ${checked ? "font-semibold text-slate-800" : "text-slate-600"}`}>{emp.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400">{assignIds.length} موظف محدد</span>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" onClick={() => setShowAssignEmployees(false)}>إلغاء</Button>
              <Button onClick={handleAssignEmployees} loading={saving}>إسناد</Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelivery}
        onClose={() => setConfirmDelivery(false)}
        onConfirm={handleApproveDelivery}
        title="تم استلام الحفل والمواد من الموارد"
        message="بتأكيدك هذا تؤكد استلام جميع المواد من الموارد وتصبح مسؤولاً عنها. بعد التأكيد ستحتاج لتحديد موقع الحفلة."
        confirmLabel="نعم، تم الاستلام من الموارد"
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        open={confirmReturn}
        onClose={() => setConfirmReturn(false)}
        onConfirm={handleApproveReturn}
        title="تم استلام المواد من الحفلة"
        message="بتأكيدك هذا تؤكد استلامك جميع المواد من موظفي الحفلة. الخطوة التالية: تسليمها إلى الموارد."
        confirmLabel="نعم، تم الاستلام من الحفلة"
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        open={confirmDeliverToWarehouse}
        onClose={() => setConfirmDeliverToWarehouse(false)}
        onConfirm={handleDeliverToWarehouse}
        title="تم تسليم المواد إلى الموارد"
        message="بتأكيدك هذا تؤكد تسليم جميع المواد إلى مدير الموارد. سيقوم بتأكيد الاستلام وإضافتها للموارد."
        confirmLabel="نعم، تم التسليم للموارد"
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        open={confirmExecuting}
        onClose={() => setConfirmExecuting(false)}
        onConfirm={handleAdvanceToExecuting}
        title="بدء تنفيذ الحفلة"
        message="بتأكيدك هذا تؤكد أن الحفلة بدأت وأن جميع المواد في موقع الحفلة."
        confirmLabel="نعم، بدأت الحفلة"
        variant="primary"
        loading={saving}
      />
    </div>
  );
}
