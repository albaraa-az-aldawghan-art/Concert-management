"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertById, getConcertItems, updateConcert, deleteConcertItem, addConcertItem, getConcertPayments, addConcertPayment, deleteConcertPayment, addConcertLog, getConcertLogs, markConcertAsPaid, updateConcertExternalCost, cancelConcert } from "@/lib/firestore/concerts";
import { getRequestsByConcert } from "@/lib/firestore/requests";
import { getMissingItemsByConcert } from "@/lib/firestore/missing-items";
import { getFoodCategories, getConcertFood, addConcertFood, deleteConcertFood } from "@/lib/firestore/food";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUserById, getUsersByRole } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { Concert, ConcertItem, MissingItem, AppUser, FoodCategory, ConcertFood, ConcertPayment, PaymentMethod, WarehouseItem, ConcertLocation, ConcertLog, WarehouseRequest } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Calendar, MapPin, Users, Package, AlertTriangle, Pencil, Trash2, ChevronRight, Phone, UserRound, BadgeDollarSign, UtensilsCrossed, Plus, Banknote, CreditCard, Landmark, CalendarDays, Building2, Hash, CheckCircle2, Circle, Check, Banknote as BanknoteIcon, FileText, XCircle } from "lucide-react";
import { Timestamp } from "firebase/firestore";

const METHOD_LABELS: Record<PaymentMethod, string> = { card: "شبكة", cash: "كاش", bank_transfer: "تحويل بنكي" };
const METHOD_COLORS: Record<PaymentMethod, string> = {
  card: "bg-[#D4DCE8] text-[#1C2D50]",
  cash: "bg-green-100 text-green-700",
  bank_transfer: "bg-purple-100 text-purple-700",
};
function getPaymentDetail(p: ConcertPayment): string {
  if (p.method === "card") return p.cardType === "visa" ? "فيزا" : "مدى";
  if (p.method === "cash") return p.receiverName || "";
  return [p.bankName, p.senderName].filter(Boolean).join(" — ");
}
import Link from "next/link";

const LocationPickerDynamic = dynamic(
  () => import("@/components/map/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-72 bg-slate-100 rounded-xl animate-pulse" /> }
);

export default function AdminConcertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { appUser } = useAuth();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [allEmployees, setAllEmployees] = useState<AppUser[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteItemTarget, setDeleteItemTarget] = useState<ConcertItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showEditSupervisors, setShowEditSupervisors] = useState(false);
  const [showEditEmployees, setShowEditEmployees] = useState(false);
  const [editSupervisorIds, setEditSupervisorIds] = useState<string[]>([]);
  const [editEmployeeIds, setEditEmployeeIds] = useState<string[]>([]);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [editLocation, setEditLocation] = useState<ConcertLocation | null>(null);
  const [showEditHallCost, setShowEditHallCost] = useState(false);
  const [editHallCostType, setEditHallCostType] = useState<"none" | "percentage" | "fixed">("none");
  const [editHallCostValue, setEditHallCostValue] = useState("");
  const [editHallCostDate, setEditHallCostDate] = useState("");
  const [editHallCostRecipient, setEditHallCostRecipient] = useState("");
  const [showEditNotes, setShowEditNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [showEditTransport, setShowEditTransport] = useState(false);
  const [editTransportCost, setEditTransportCost] = useState("");
  const [showEditLabor, setShowEditLabor] = useState(false);
  const [editLaborCount, setEditLaborCount] = useState("");
  const [editLaborPricePerUnit, setEditLaborPricePerUnit] = useState("");
  const [showEditDate, setShowEditDate] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [showEditVenueName, setShowEditVenueName] = useState(false);
  const [editVenueName, setEditVenueName] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelHasRefund, setCancelHasRefund] = useState(false);
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  const [cancelRefundDate, setCancelRefundDate] = useState("");
  const [cancelRefundMethod, setCancelRefundMethod] = useState<PaymentMethod>("cash");
  const [logs, setLogs] = useState<ConcertLog[]>([]);
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [saving, setSaving] = useState(false);
  const [paidSaving, setPaidSaving] = useState(false);

  const [payments, setPayments] = useState<ConcertPayment[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<ConcertPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    method: "card" as PaymentMethod,
    amount: "",
    date: "",
    cardType: "visa" as "visa" | "mada",
    receiverName: "",
    bankName: "",
    senderName: "",
  });

  const [foodCategories, setFoodCategories] = useState<FoodCategory[]>([]);
  const [concertFood, setConcertFood] = useState<ConcertFood[]>([]);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [deleteFoodTarget, setDeleteFoodTarget] = useState<ConcertFood | null>(null);
  const [addFoodCategoryId, setAddFoodCategoryId] = useState("");
  const [addFoodCheck, setAddFoodCheck] = useState<Record<string, { checked: boolean; quantity: string }>>({});

  const [addItemType, setAddItemType] = useState<"" | "internal" | "external">("");
  const [addItemCheck, setAddItemCheck] = useState<Record<string, { checked: boolean; quantity: string }>>({});

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const [concertData, itemsData, missingData, foodCats, foodItems, paymentsData, warehouseData, allSups, allEmps, logsData, requestsData] = await Promise.all([
      getConcertById(id),
      getConcertItems(id),
      getMissingItemsByConcert(id),
      getFoodCategories(),
      getConcertFood(id),
      getConcertPayments(id),
      getWarehouseItems(),
      getUsersByRole("supervisor"),
      getUsersByRole("employee"),
      getConcertLogs(id),
      getRequestsByConcert(id),
    ]);
    setConcert(concertData);
    setItems(itemsData);
    setMissing(missingData);
    setFoodCategories(foodCats);
    setConcertFood(foodItems);
    setPayments(paymentsData);
    setWarehouseItems(warehouseData);
    setAllSupervisors(allSups);
    setAllEmployees(allEmps);
    setLogs(logsData);
    setRequests(requestsData);

    if (concertData) {
      const supData = await Promise.all(concertData.supervisorIds.map((uid) => getUserById(uid)));
      const empData = await Promise.all(concertData.employeeIds.map((uid) => getUserById(uid)));
      setSupervisors(supData.filter(Boolean) as AppUser[]);
      setEmployees(empData.filter(Boolean) as AppUser[]);
    }
    setLoading(false);
  }

  async function handleAddFoodBatch() {
    if (!appUser) return;
    const entries = Object.entries(addFoodCheck).filter(([, s]) => s.checked);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(entries.map(([k, s]) => {
        const [catId, opt] = k.split(":::");
        const cat = foodCategories.find((c) => c.id === catId)!;
        return addConcertFood({
          concertId: id,
          categoryId: cat.id,
          categoryName: cat.name,
          selectedOption: opt || cat.name,
          quantity: s.quantity ? parseInt(s.quantity) : null,
          notes: null,
          createdBy: appUser.uid,
        });
      }));
      const names = entries.map(([k]) => { const [catId, opt] = k.split(":::"); const cat = foodCategories.find((c) => c.id === catId)!; return `${cat.name}${opt ? " — " + opt : ""}`; }).join("، ");
      await addConcertLog({ concertId: id, description: `تمت إضافة أصناف: ${names}`, createdBy: appUser.uid });
      showToast("تم إضافة الأصناف");
      setShowFoodForm(false);
      setAddFoodCategoryId("");
      setAddFoodCheck({});
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFood() {
    if (!deleteFoodTarget || !appUser) return;
    setSaving(true);
    try {
      await deleteConcertFood(deleteFoodTarget.id);
      await addConcertLog({ concertId: id, description: `تم حذف صنف: ${deleteFoodTarget.categoryName} — ${deleteFoodTarget.selectedOption}`, createdBy: appUser.uid });
      showToast("تم حذف قسم المأكولات من الحفلة");
      setDeleteFoodTarget(null);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPayment() {
    if (!appUser || !concert || !paymentForm.amount || !paymentForm.date) return;
    const amt = parseFloat(paymentForm.amount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      await addConcertPayment({
        concertId: concert.id,
        method: paymentForm.method,
        amount: amt,
        date: paymentForm.date,
        cardType: paymentForm.method === "card" ? paymentForm.cardType : null,
        receiverName: paymentForm.method === "cash" ? paymentForm.receiverName.trim() || null : null,
        bankName: paymentForm.method === "bank_transfer" ? paymentForm.bankName.trim() || null : null,
        senderName: paymentForm.method === "bank_transfer" ? paymentForm.senderName.trim() || null : null,
        createdBy: appUser.uid,
      });
      showToast("تمت إضافة الدفعة");
      setShowPaymentForm(false);
      setPaymentForm({ method: "card", amount: "", date: "", cardType: "visa", receiverName: "", bankName: "", senderName: "" });
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment() {
    if (!deletePaymentTarget || !concert) return;
    setSaving(true);
    try {
      await deleteConcertPayment(deletePaymentTarget.id, concert.id);
      showToast("تم حذف الدفعة");
      setDeletePaymentTarget(null);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem() {
    if (!deleteItemTarget || !appUser || !concert) return;
    setSaving(true);
    try {
      await deleteConcertItem(deleteItemTarget.id);
      await updateConcertExternalCost(concert.id);
      await addConcertLog({ concertId: id, description: `تم حذف مادة: ${deleteItemTarget.itemName} × ${deleteItemTarget.count}`, createdBy: appUser.uid });
      showToast("تم حذف المادة من الحفلة");
      setDeleteItemTarget(null);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItems() {
    if (!appUser || !concert) return;
    const entries = Object.entries(addItemCheck).filter(([, s]) => s.checked);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(entries.map(([itemId, s]) => {
        const item = warehouseItems.find((i) => i.id === itemId)!;
        const count = parseInt(s.quantity) || 1;
        const unitCost = item.type === "external" ? (item.pricePerUnit ?? null) : null;
        const totalCost = unitCost != null ? unitCost * count : null;
        return addConcertItem({ concertId: concert.id, itemId: item.id, itemName: item.name, type: item.type, count, unitCost, totalCost, assignedToEmployeeId: null, assignedToEmployeeName: null });
      }));
      await updateConcertExternalCost(concert.id);
      const names = entries.map(([itemId, s]) => { const item = warehouseItems.find((i) => i.id === itemId)!; return `${item.name} × ${parseInt(s.quantity) || 1}`; }).join("، ");
      await addConcertLog({ concertId: concert.id, description: `تمت إضافة مواد: ${names}`, createdBy: appUser.uid });
      showToast("تمت إضافة المواد");
      setShowItemForm(false);
      setAddItemType("");
      setAddItemCheck({});
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePrice() {
    if (!concert || !appUser) return;
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) { showToast("يرجى إدخال سعر صحيح", "error"); return; }
    setSaving(true);
    try {
      const oldPrice = concert.price;
      await updateConcert(concert.id, { price });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير سعر الحفلة من ${oldPrice?.toLocaleString("ar-SA")} ريال إلى ${price.toLocaleString("ar-SA")} ريال`, createdBy: appUser.uid });
      showToast("تم تحديث سعر الحفلة");
      setShowEditPrice(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveHallCost() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const type = editHallCostType === "none" ? null : editHallCostType;
      const value = editHallCostType === "none" ? null : parseFloat(editHallCostValue);
      const oldDesc = concert.hallCostType
        ? `${concert.hallCostValue}${concert.hallCostType === "percentage" ? "%" : " ريال"}`
        : "بدون";
      const newDesc = type ? `${value}${type === "percentage" ? "%" : " ريال"}` : "بدون";
      await updateConcert(concert.id, {
        hallCostType: type,
        hallCostValue: value,
        hallCostDate: editHallCostDate || null,
        hallCostRecipient: editHallCostRecipient.trim() || null,
      });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير مبلغ القاعة من ${oldDesc} إلى ${newDesc}`, createdBy: appUser.uid });
      showToast("تم تحديث مبلغ القاعة");
      setShowEditHallCost(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTransport() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const cost = editTransportCost ? parseFloat(editTransportCost) : null;
      const oldDesc = concert.transportCost ? `${concert.transportCost.toLocaleString("ar-SA")} ريال` : "بدون";
      const newDesc = cost ? `${cost.toLocaleString("ar-SA")} ريال` : "بدون";
      await updateConcert(concert.id, { transportCost: cost });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير تكلفة النقل من ${oldDesc} إلى ${newDesc}`, createdBy: appUser.uid });
      showToast("تم تحديث تكلفة النقل");
      setShowEditTransport(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLabor() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const count = editLaborCount ? parseInt(editLaborCount) : null;
      const price = editLaborPricePerUnit ? parseFloat(editLaborPricePerUnit) : null;
      const total = count && price ? count * price : null;
      await updateConcert(concert.id, { laborCount: count, laborPricePerUnit: price, laborCost: total });
      await addConcertLog({ concertId: concert.id, description: `تم تحديث تكلفة العمالة: ${count ?? 0} × ${price?.toLocaleString("ar-SA") ?? 0} = ${total?.toLocaleString("ar-SA") ?? 0} ريال`, createdBy: appUser.uid });
      showToast("تم تحديث تكلفة العمالة");
      setShowEditLabor(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVenueName() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const oldName = concert.venueName || "—";
      const newName = editVenueName.trim() || null;
      await updateConcert(concert.id, { venueName: newName });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير اسم المكان من "${oldName}" إلى "${newName ?? "—"}"`, createdBy: appUser.uid, field: "venueName", oldValue: oldName, newValue: newName ?? "" });
      showToast("تم تحديث اسم المكان");
      setShowEditVenueName(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDate() {
    if (!concert || !appUser || !editDate) return;
    setSaving(true);
    try {
      const oldDesc = formatDate(concert.date);
      const oldDateISO = concert.date?.toDate().toISOString().split("T")[0] ?? "";
      const newTimestamp = Timestamp.fromDate(new Date(editDate + "T12:00:00"));
      await updateConcert(concert.id, { date: newTimestamp });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير تاريخ الحفلة من ${oldDesc} إلى ${formatDate(newTimestamp)}`, createdBy: appUser.uid, field: "date", oldValue: oldDateISO, newValue: editDate });
      showToast("تم تحديث تاريخ الحفلة");
      setShowEditDate(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLocation() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const updates: Partial<Concert> = { location: editLocation };
      if (concert.status === "active" && editLocation) updates.status = "location_set";
      await updateConcert(concert.id, updates);
      const desc = editLocation ? `تم تغيير الموقع إلى: ${editLocation.address}` : "تم إزالة الموقع";
      await addConcertLog({ concertId: concert.id, description: desc, createdBy: appUser.uid });
      showToast("تم تحديث الموقع");
      setShowEditLocation(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAsPaid() {
    if (!concert || !appUser) return;
    setPaidSaving(true);
    try {
      await markConcertAsPaid(concert.id, appUser.uid);
      await addConcertLog({ concertId: concert.id, description: "تم تأكيد التسوية المالية — الحفلة مكتملة بالكامل", createdBy: appUser.uid });
      showToast("تم تأكيد التسوية المالية");
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setPaidSaving(false);
    }
  }

  async function handleSaveSupervisors() {
    if (!concert) return;
    if (editSupervisorIds.length === 0) { showToast("يرجى اختيار مشرف واحد على الأقل", "error"); return; }
    setSaving(true);
    try {
      await updateConcert(concert.id, { supervisorIds: editSupervisorIds });
      showToast("تم تحديث المشرفين");
      setShowEditSupervisors(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEmployees() {
    if (!concert) return;
    setSaving(true);
    try {
      await updateConcert(concert.id, { employeeIds: editEmployeeIds });
      showToast("تم تحديث الموظفين");
      setShowEditEmployees(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      await updateConcert(concert.id, { notes: editNotes.trim() || null });
      await addConcertLog({ concertId: concert.id, description: "تم تحديث الملاحظات", createdBy: appUser.uid });
      showToast("تم تحديث الملاحظات");
      setShowEditNotes(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelConcert() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      await cancelConcert(concert.id, {
        reason: cancelReason.trim(),
        refundAmount: cancelHasRefund && cancelRefundAmount ? parseFloat(cancelRefundAmount) : null,
        refundDate: cancelHasRefund && cancelRefundDate ? cancelRefundDate : null,
        refundMethod: cancelHasRefund ? cancelRefundMethod : null,
      });
      await addConcertLog({ concertId: concert.id, description: `تم إلغاء الحفلة${cancelReason ? ": " + cancelReason : ""}`, createdBy: appUser.uid });
      showToast("تم إلغاء الحفلة");
      setShowCancelModal(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
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
    return <div className="text-center py-12 text-slate-400">الحفلة غير موجودة</div>;
  }

  const internalItems = items.filter((i) => i.type === "internal");
  const externalItems = items.filter((i) => i.type === "external");
  const internalMissing = missing.filter((m) => m.type === "internal");
  const externalMissing = missing.filter((m) => m.type === "external");

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/concerts" className="hover:text-[#1C2D50]">الحفلات</Link>
        <ChevronRight size={14} />
        <span className="text-slate-800 font-medium">{concert.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {concert.concertNumber != null && (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-[#1C2D50] text-[#D4DCE8] px-2.5 py-1 rounded-full">
                <Hash size={11} />
                {String(concert.concertNumber).padStart(3, "0")}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{concert.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={concert.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/contract/${concert.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1C2D50] text-white hover:bg-[#111D35] transition-colors"
          >
            <FileText size={15} />
            عرض الاتفاقية
          </a>
          {concert.status !== "cancelled" && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
            >
              <XCircle size={15} />
              إلغاء العقد
            </button>
          )}
        </div>
      </div>

      {/* Cancellation notice */}
      {concert.status === "cancelled" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <XCircle size={16} />
            هذه الحفلة ملغاة
          </div>
          {concert.cancellationReason && <p className="text-sm text-red-600">السبب: {concert.cancellationReason}</p>}
          {concert.refundAmount && concert.refundAmount > 0 && (
            <p className="text-sm text-red-600">
              المبلغ المسترد: {concert.refundAmount.toLocaleString("ar-SA")} ريال
              {concert.refundDate && ` — بتاريخ ${concert.refundDate}`}
            </p>
          )}
        </div>
      )}

      {/* ── Pipeline ── مراحل الحفلة التسلسلية */}
      {(() => {
        const STATUS_ORDER = [
          "planned", "confirmed", "materials_requested", "active",
          "location_set", "executing", "materials_returned",
          "delivered_to_warehouse", "warehouse_confirmed", "completed",
        ];
        const STAGES = [
          { status: "planned",                label: "غير مؤكدة",          desc: "في انتظار الدفعة الأولى" },
          { status: "confirmed",              label: "مؤكدة",              desc: "تم استلام الدفعة الأولى" },
          { status: "materials_requested",    label: "طلب المواد",          desc: "المشرف طلب مواد من المخزن" },
          { status: "active",                 label: "استلام المواد",       desc: "المشرف استلم المواد من المخزن" },
          { status: "location_set",           label: "تحديد الموقع",        desc: "تم تحديد موقع الحفلة" },
          { status: "executing",              label: "تنفيذ الحفلة",        desc: "الحفلة جارية الآن" },
          { status: "materials_returned",     label: "استلام المواد",       desc: "المشرف استلم المواد من الحفلة" },
          { status: "delivered_to_warehouse", label: "تسليم للمخزن",        desc: "المشرف سلّم المواد للمخزن" },
          { status: "warehouse_confirmed",    label: "تأكيد المخزن",        desc: "مدير المخازن أكد الاستلام" },
          { status: "completed",              label: "مكتملة",             desc: "التسوية المالية منتهية" },
        ];
        const currentIdx = STATUS_ORDER.indexOf(concert.status);
        return (
          <Card>
            <h3 className="font-bold text-slate-800 mb-4">مراحل الحفلة</h3>

            {/* Scrollable horizontal pipeline */}
            <div className="overflow-x-auto pb-3">
              <div className="flex items-start gap-0 min-w-max">
                {STAGES.map((stage, i) => {
                  const isCompleted = i < currentIdx;
                  const isCurrent   = i === currentIdx;
                  return (
                    <div key={stage.status} className="flex items-start">
                      <div className="flex flex-col items-center w-[72px]">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          isCompleted ? "bg-green-500 border-green-500" :
                          isCurrent   ? "bg-[#1C2D50] border-[#1C2D50]" :
                                        "bg-white border-slate-200"
                        }`}>
                          {isCompleted
                            ? <Check size={13} className="text-white" />
                            : <span className={`text-[10px] font-bold ${isCurrent ? "text-white" : "text-slate-400"}`}>{i + 1}</span>
                          }
                        </div>
                        <p className={`text-[9px] font-semibold text-center mt-1.5 leading-tight px-0.5 ${
                          isCompleted ? "text-green-600" :
                          isCurrent   ? "text-[#1C2D50]" :
                                        "text-slate-400"
                        }`}>{stage.label}</p>
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={`h-0.5 w-5 mt-4 shrink-0 ${i < currentIdx ? "bg-green-400" : "bg-slate-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current stage description */}
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${
              concert.status === "completed" ? "bg-green-50 border border-green-100" :
              "bg-[#EEF1F7] border border-[#D4DCE8]"
            }`}>
              <p className={`font-semibold ${concert.status === "completed" ? "text-green-700" : "text-[#1C2D50]"}`}>
                المرحلة الحالية: {STAGES[Math.max(0, currentIdx)]?.label}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">{STAGES[Math.max(0, currentIdx)]?.desc}</p>
            </div>

            {/* Sub-states: materials_requested → warehouse requests */}
            {concert.status === "materials_requested" && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">حالة طلبات المواد</p>
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-400">لا توجد طلبات بعد</p>
                ) : (
                  <div className="space-y-1.5">
                    {requests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{req.itemName}</p>
                          <p className="text-xs text-slate-400">عدد: {req.requestedCount}</p>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Admin action: financial settlement */}
            {concert.status === "warehouse_confirmed" && !concert.isPaid && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">الخطوة التالية — التسوية المالية</p>
                <Button onClick={handleMarkAsPaid} loading={paidSaving} className="w-full gap-2">
                  <CheckCircle2 size={16} />
                  تأكيد التسوية المالية وإغلاق الحفلة
                </Button>
              </div>
            )}
            {concert.status === "completed" && concert.isPaid && (
              <div className="mt-4 border-t border-green-100 pt-4 flex items-center gap-2 text-green-600 text-sm font-semibold">
                <CheckCircle2 size={16} />
                الحفلة مكتملة بالكامل ✓
              </div>
            )}
          </Card>
        );
      })()}

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Calendar size={15} />
            <span className="text-xs font-medium">تاريخ الإنشاء</span>
          </div>
          <p className="font-semibold text-slate-800 text-sm">{formatDate(concert.createdAt)}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <CalendarDays size={15} />
              <span className="text-xs font-medium">تاريخ الحفلة</span>
            </div>
            <button
              onClick={() => {
                const d = concert.date?.toDate();
                const str = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
                setEditDate(str);
                setShowEditDate(true);
              }}
              className="text-slate-300 hover:text-blue-500 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </div>
          <p className="font-semibold text-slate-800 text-sm">{formatDate(concert.date)}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <BadgeDollarSign size={15} />
              <span className="text-xs font-medium">سعر الحفلة</span>
            </div>
            <button onClick={() => { setEditPrice(String(concert.price ?? "")); setShowEditPrice(true); }} className="text-slate-300 hover:text-blue-500 transition-colors">
              <Pencil size={13} />
            </button>
          </div>
          <p className="font-bold text-green-700 text-lg">{concert.price?.toLocaleString("ar-SA")} ريال</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <MapPin size={15} />
              <span className="text-xs font-medium">الموقع</span>
            </div>
            <button onClick={() => { setEditLocation(concert.location ?? null); setShowEditLocation(true); }} className="text-slate-300 hover:text-blue-500 transition-colors">
              <Pencil size={13} />
            </button>
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.location?.address || "—"}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Building2 size={15} />
              <span className="text-xs font-medium">اسم المكان</span>
            </div>
            <button
              onClick={() => { setEditVenueName(concert.venueName ?? ""); setShowEditVenueName(true); }}
              className="text-slate-300 hover:text-blue-500 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.venueName || "—"}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Users size={15} />
            <span className="text-xs font-medium">الفريق</span>
          </div>
          <p className="font-semibold text-slate-800">{supervisors.length} مشرف · {employees.length} موظف</p>
        </Card>
      </div>

      {/* Hall & Transport Costs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Hall Cost */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <BadgeDollarSign size={15} />
              <span className="text-xs font-medium">مبلغ القاعة</span>
            </div>
            <button
              onClick={() => {
                setEditHallCostType(concert.hallCostType ?? "none");
                setEditHallCostValue(String(concert.hallCostValue ?? ""));
                setEditHallCostDate(concert.hallCostDate ?? "");
                setEditHallCostRecipient(concert.hallCostRecipient ?? "");
                setShowEditHallCost(true);
              }}
              className="flex items-center gap-1 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] bg-[#EEF1F7] hover:bg-[#D4DCE8] px-2 py-0.5 rounded-lg transition-colors"
            >
              <Pencil size={11} />
              تعديل
            </button>
          </div>
          {concert.hallCostType === "percentage" ? (
            <div>
              <p className="font-bold text-slate-800 text-lg">{concert.hallCostValue}%</p>
              <p className="text-xs text-slate-400">= {((concert.price ?? 0) * (concert.hallCostValue ?? 0) / 100).toLocaleString("ar-SA")} ريال</p>
            </div>
          ) : concert.hallCostType === "fixed" ? (
            <p className="font-bold text-slate-800 text-lg">{concert.hallCostValue?.toLocaleString("ar-SA")} ريال</p>
          ) : (
            <p className="text-slate-400 text-sm">لم يُضَف بعد</p>
          )}
          {(concert.hallCostDate || concert.hallCostRecipient) && (
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
              {concert.hallCostDate && (
                <p className="text-xs text-slate-500">تاريخ التسليم: <span className="font-medium text-slate-700">{concert.hallCostDate}</span></p>
              )}
              {concert.hallCostRecipient && (
                <p className="text-xs text-slate-500">المستلم: <span className="font-medium text-slate-700">{concert.hallCostRecipient}</span></p>
              )}
            </div>
          )}
        </Card>

        {/* Transport Cost */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <BadgeDollarSign size={15} />
              <span className="text-xs font-medium">تكلفة النقل</span>
            </div>
            <button
              onClick={() => { setEditTransportCost(String(concert.transportCost ?? "")); setShowEditTransport(true); }}
              className="flex items-center gap-1 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] bg-[#EEF1F7] hover:bg-[#D4DCE8] px-2 py-0.5 rounded-lg transition-colors"
            >
              <Pencil size={11} />
              تعديل
            </button>
          </div>
          {concert.transportCost ? (
            <p className="font-bold text-slate-800 text-lg">{concert.transportCost.toLocaleString("ar-SA")} ريال</p>
          ) : (
            <p className="text-slate-400 text-sm">لم يُضَف بعد</p>
          )}
        </Card>

        {/* Labor Cost */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Users size={15} />
              <span className="text-xs font-medium">تكلفة العمالة</span>
            </div>
            <button
              onClick={() => { setEditLaborCount(String(concert.laborCount ?? "")); setEditLaborPricePerUnit(String(concert.laborPricePerUnit ?? "")); setShowEditLabor(true); }}
              className="flex items-center gap-1 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] bg-[#EEF1F7] hover:bg-[#D4DCE8] px-2 py-0.5 rounded-lg transition-colors"
            >
              <Pencil size={11} />
              تعديل
            </button>
          </div>
          {concert.laborCost ? (
            <div>
              <p className="font-bold text-slate-800 text-lg">{concert.laborCost.toLocaleString("ar-SA")} ريال</p>
              {concert.laborCount && concert.laborPricePerUnit && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {concert.laborCount} عامل × {concert.laborPricePerUnit.toLocaleString("ar-SA")} ريال
                </p>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">لم يُضَف بعد</p>
          )}
        </Card>
      </div>

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

      {/* Notes */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="text-sm font-bold text-slate-700">الملاحظات</span>
          </div>
          <button
            onClick={() => { setEditNotes(concert.notes ?? ""); setShowEditNotes(true); }}
            className="flex items-center gap-1 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] bg-[#EEF1F7] hover:bg-[#D4DCE8] px-2 py-0.5 rounded-lg transition-colors"
          >
            <Pencil size={11} />
            تعديل
          </button>
        </div>
        {concert.notes ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{concert.notes}</p>
        ) : (
          <p className="text-sm text-slate-400">لا توجد ملاحظات</p>
        )}
      </Card>

      {/* Payment */}
      <Card>
        <div className="flex items-center gap-2 text-slate-700 mb-3">
          <Banknote size={16} className="text-emerald-600" />
          <span className="font-bold">الدفع</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">السعر الكلي</p>
            <p className="font-bold text-slate-800 text-lg">{concert.price?.toLocaleString("ar-SA")} ريال</p>
          </div>
          <div className="bg-[#EEF1F7] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">إجمالي المدفوع</p>
            <p className="font-bold text-[#1C2D50] text-lg">
              {concert.deposit ? `${concert.deposit.toLocaleString("ar-SA")} ريال` : "—"}
            </p>
          </div>
          <div className="bg-orange-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">المبلغ المتبقي</p>
            <p className="font-bold text-orange-700 text-lg">
              {((concert.price ?? 0) - (concert.deposit ?? 0)).toLocaleString("ar-SA")} ريال
            </p>
          </div>
        </div>

        <Button onClick={() => setShowPaymentForm(true)} variant="outline" className="mb-4">
          <Plus size={16} /> إضافة دفعة
        </Button>

        {/* Payment Records */}
        {payments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 mb-2">سجل الدفعات</p>
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    {p.method === "card" && <CreditCard size={13} className="text-blue-500" />}
                    {p.method === "cash" && <Banknote size={13} className="text-green-500" />}
                    {p.method === "bank_transfer" && <Landmark size={13} className="text-purple-500" />}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${METHOD_COLORS[p.method]}`}>{METHOD_LABELS[p.method]}</span>
                    <span className="font-bold text-slate-800 text-sm">{p.amount.toLocaleString("ar-SA")} ريال</span>
                  </div>
                  <p className="text-xs text-slate-400 pr-5">
                    {p.date}
                    {getPaymentDetail(p) && ` — ${getPaymentDetail(p)}`}
                  </p>
                </div>
                <button
                  onClick={() => setDeletePaymentTarget(p)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>


      {/* Supervisors & Employees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">المشرفون ({supervisors.length})</h3>
            <Button size="sm" variant="outline" onClick={() => { setEditSupervisorIds(concert.supervisorIds); setShowEditSupervisors(true); }}>
              <Pencil size={13} /> تعديل
            </Button>
          </div>
          {supervisors.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مشرفون</p>
          ) : (
            <div className="space-y-2">
              {supervisors.map((s) => (
                <div key={s.uid} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] text-xs font-bold">
                    {s.name.charAt(0)}
                  </div>
                  <span className="text-sm text-slate-700">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">الموظفون ({employees.length})</h3>
            <Button size="sm" variant="outline" onClick={() => { setEditEmployeeIds(concert.employeeIds); setShowEditEmployees(true); }}>
              <Pencil size={13} /> تعديل
            </Button>
          </div>
          {employees.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد موظفون</p>
          ) : (
            <div className="space-y-2">
              {employees.map((e) => (
                <div key={e.uid} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                    {e.name.charAt(0)}
                  </div>
                  <span className="text-sm text-slate-700">{e.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Items */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Package size={16} className="text-indigo-600" />
            المواد ({items.length})
          </h3>
          <Button size="sm" onClick={() => { setAddItemType(""); setAddItemCheck({}); setShowItemForm(true); }}>
            <Plus size={14} /> إضافة مادة
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl">
            <Package size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مواد</p>
          </div>
        ) : (
          <div className="space-y-4">
            {internalItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">داخلية</p>
                <div className="space-y-2">
                  {internalItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                        {item.assignedToEmployeeName && (
                          <p className="text-xs text-slate-400">مسند لـ: {item.assignedToEmployeeName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#1C2D50]">{item.count}</span>
                        <StatusBadge status={item.deliveryStatus} />
                        <button
                          onClick={() => setDeleteItemTarget(item)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {externalItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">خارجية</p>
                <div className="space-y-2">
                  {externalItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                        {item.totalCost != null && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            {item.unitCost?.toLocaleString("ar-SA")} ريال × {item.count} =
                            <span className="font-bold mr-1">{item.totalCost.toLocaleString("ar-SA")} ريال</span>
                          </p>
                        )}
                        {item.assignedToEmployeeName && (
                          <p className="text-xs text-slate-400">مسند لـ: {item.assignedToEmployeeName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#1C2D50]">{item.count}</span>
                        <StatusBadge status={item.returnStatus} />
                        <button
                          onClick={() => setDeleteItemTarget(item)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const extTotal = externalItems.reduce((s, i) => s + (i.totalCost ?? 0), 0);
                  if (extTotal === 0) return null;
                  return (
                    <div className="flex justify-between px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl mt-2">
                      <span className="text-sm font-semibold text-amber-700">إجمالي تكلفة المواد الخارجية</span>
                      <span className="font-bold text-amber-700">{extTotal.toLocaleString("ar-SA")} ريال</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Food Items */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <UtensilsCrossed size={16} className="text-orange-500" />
            أصناف الأكل ({concertFood.length})
          </h3>
          {foodCategories.length > 0 && (
            <Button size="sm" onClick={() => { setAddFoodCategoryId(""); setAddFoodCheck({}); setShowFoodForm(true); }}>
              <Plus size={14} /> إضافة
            </Button>
          )}
        </div>
        {concertFood.length === 0 ? (
          <p className="text-sm text-slate-400">لم تتم إضافة أي أصناف أكل لهذه الحفلة</p>
        ) : (
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
                <button
                  onClick={() => setDeleteFoodTarget(f)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Missing Items */}
      {missing.length > 0 && (
        <Card className="border-red-200">
          <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} />
            المفقودات ({missing.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "داخلي", data: internalMissing },
              { label: "خارجي", data: externalMissing },
            ].map(({ label, data }) =>
              data.length > 0 ? (
                <div key={label}>
                  <p className="text-xs font-semibold text-slate-500 mb-2">{label}</p>
                  <div className="space-y-2">
                    {data.map((m) => (
                      <div key={m.id} className="flex justify-between bg-red-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-slate-800">{m.itemName}</span>
                        <span className="text-sm font-bold text-red-600">{m.missingCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </Card>
      )}

      {/* Change Log */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-slate-500" />
          سجل الحفلة
        </h3>
        <div className="relative">
          <div className="absolute right-3 top-0 bottom-0 w-px bg-slate-100" />
          <div className="space-y-0">
            {/* Creation entry — always first */}
            <div className="relative flex gap-4 pb-5">
              <div className="relative z-10 w-6 h-6 rounded-full bg-[#D4DCE8] flex items-center justify-center shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-[#EEF1F7]0" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">تم إنشاء الحفلة</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(concert.createdAt)}</p>
              </div>
            </div>

            {/* Change entries — newest first */}
            {[...logs].sort((a, b) => a.createdAt.seconds - b.createdAt.seconds).map((log) => (
              <div key={log.id} className="relative flex gap-4 pb-5">
                <div className="relative z-10 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-700">{log.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(log.createdAt)}</p>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="relative flex gap-4 pb-1">
                <div className="relative z-10 w-6 h-6 shrink-0" />
                <p className="text-sm text-slate-400">لا توجد تعديلات بعد الإنشاء</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Add Payment Modal */}
      <Modal open={showPaymentForm} onClose={() => setShowPaymentForm(false)} title="إضافة دفعة">
        <div className="space-y-4">
          {/* Method Tabs */}
          <div className="flex gap-2">
            {(["card", "cash", "bank_transfer"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors flex items-center justify-center gap-1.5 ${
                  paymentForm.method === m
                    ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {m === "card" && <CreditCard size={14} />}
                {m === "cash" && <Banknote size={14} />}
                {m === "bank_transfer" && <Landmark size={14} />}
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>

          {paymentForm.method === "card" && (
            <Select label="نوع الكارد" value={paymentForm.cardType} onChange={(e) => setPaymentForm({ ...paymentForm, cardType: e.target.value as "visa" | "mada" })}>
              <option value="visa">فيزا</option>
              <option value="mada">مدى</option>
            </Select>
          )}
          {paymentForm.method === "cash" && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">اسم المستلم</label>
              <input type="text" value={paymentForm.receiverName} onChange={(e) => setPaymentForm({ ...paymentForm, receiverName: e.target.value })} placeholder="اسم الشخص المستلم" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>
          )}
          {paymentForm.method === "bank_transfer" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">اسم البنك</label>
                <input type="text" value={paymentForm.bankName} onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })} placeholder="مثال: الراجحي" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">اسم المحول</label>
                <input type="text" value={paymentForm.senderName} onChange={(e) => setPaymentForm({ ...paymentForm, senderName: e.target.value })} placeholder="اسم المحول" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">المبلغ (ريال)</label>
              <input type="number" min={1} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0.00" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">التاريخ</label>
              <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>
          </div>

          {paymentForm.amount && concert && (
            <div className="bg-[#EEF1F7] border border-[#EEF1F7] rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">المتبقي بعد الدفعة</span>
                <span className="font-bold text-orange-700">
                  {((concert.price ?? 0) - (concert.deposit ?? 0) - parseFloat(paymentForm.amount || "0")).toLocaleString("ar-SA")} ريال
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowPaymentForm(false)}>إلغاء</Button>
            <Button onClick={handleAddPayment} loading={saving} disabled={!paymentForm.amount || !paymentForm.date}>تأكيد الدفعة</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Payment */}
      <ConfirmModal
        open={!!deletePaymentTarget}
        onClose={() => setDeletePaymentTarget(null)}
        onConfirm={handleDeletePayment}
        title="حذف الدفعة"
        message={`هل أنت متأكد من حذف دفعة بمبلغ ${deletePaymentTarget?.amount.toLocaleString("ar-SA")} ريال؟`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* Add Items Modal — dropdown → checklist */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title="إضافة مواد للحفلة">
        <div className="space-y-4">
          {/* Type dropdown */}
          <select
            value={addItemType}
            onChange={(e) => setAddItemType(e.target.value as "" | "internal" | "external")}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">— اختر نوع المواد —</option>
            <option value="internal">داخلي</option>
            <option value="external">خارجي</option>
          </select>

          {/* Checklist */}
          {addItemType && (() => {
            const existingIds = new Set(items.map((i) => i.itemId));
            const typeItems = warehouseItems.filter((i) => i.type === (addItemType === "internal" ? "internal" : "external") && !existingIds.has(i.id));
            if (typeItems.length === 0) return <p className="text-sm text-slate-400 text-center py-4">لا توجد مواد إضافية من هذا النوع</p>;
            return (
              <div className="border border-indigo-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <div className="divide-y divide-slate-50">
                  {typeItems.map((item) => {
                    const state = addItemCheck[item.id];
                    const isChecked = state?.checked ?? false;
                    const qty = parseInt(state?.quantity ?? "1") || 1;
                    const hasPrice = item.type === "external" && item.pricePerUnit != null;
                    return (
                      <div key={item.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${isChecked ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => setAddItemCheck((prev) => ({ ...prev, [item.id]: { checked: !prev[item.id]?.checked, quantity: prev[item.id]?.quantity ?? "1" } }))}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300 hover:border-[#1C2D50]"}`}
                          >
                            {isChecked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </button>
                        </div>
                        <div className="flex-1 min-w-0"
                          onClick={() => setAddItemCheck((prev) => ({ ...prev, [item.id]: { checked: !prev[item.id]?.checked, quantity: prev[item.id]?.quantity ?? "1" } }))}>
                          <span className={`text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                            {item.name}
                            <span className="text-xs text-slate-400 mr-1.5">(متوفر: {item.availableCount})</span>
                          </span>
                          {isChecked && hasPrice && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              {item.pricePerUnit!.toLocaleString("ar-SA")} ريال × {qty} =
                              <span className="font-bold mr-1">{(item.pricePerUnit! * qty).toLocaleString("ar-SA")} ريال</span>
                            </p>
                          )}
                        </div>
                        {isChecked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <label className="text-xs text-slate-400 whitespace-nowrap">الكمية:</label>
                            <input type="number" min={1} max={item.availableCount}
                              value={state?.quantity ?? "1"}
                              onChange={(e) => setAddItemCheck((prev) => ({ ...prev, [item.id]: { checked: true, quantity: e.target.value } }))}
                              className="w-16 border border-indigo-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Summary */}
          {Object.values(addItemCheck).some((s) => s.checked) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(addItemCheck).filter(([, s]) => s.checked).map(([itemId, s]) => {
                const item = warehouseItems.find((i) => i.id === itemId)!;
                return <span key={itemId} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{item?.name} × {parseInt(s.quantity) || 1}</span>;
              })}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowItemForm(false)}>إلغاء</Button>
            <Button onClick={handleAddItems} loading={saving} disabled={!Object.values(addItemCheck).some((s) => s.checked)}>إضافة</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteItemTarget}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={handleDeleteItem}
        title="حذف المادة"
        message={`هل أنت متأكد من حذف "${deleteItemTarget?.itemName}" من الحفلة؟`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* Add Food Modal — dropdown → checklist */}
      <Modal open={showFoodForm} onClose={() => setShowFoodForm(false)} title="إضافة أصناف أكل للحفلة">
        <div className="space-y-4">
          {/* Category dropdown */}
          <select
            value={addFoodCategoryId}
            onChange={(e) => setAddFoodCategoryId(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
          >
            <option value="">— اختر قسم الأكل —</option>
            {foodCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Checklist for selected category */}
          {addFoodCategoryId && (() => {
            const cat = foodCategories.find((c) => c.id === addFoodCategoryId);
            if (!cat) return null;
            const existingOptions = new Set(concertFood.filter((f) => f.categoryId === cat.id).map((f) => f.selectedOption));
            const options = cat.options.length > 0 ? cat.options.filter((o) => !existingOptions.has(o)) : (existingOptions.has(cat.name) ? [] : [""]);
            if (options.length === 0) return <p className="text-sm text-slate-400 text-center py-4">تمت إضافة جميع أصناف هذا القسم</p>;
            return (
              <div className="border border-orange-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <div className="divide-y divide-slate-50">
                  {options.map((opt) => {
                    const k = `${cat.id}:::${opt}`;
                    const state = addFoodCheck[k];
                    const isChecked = state?.checked ?? false;
                    const label = opt || cat.name;
                    return (
                      <div key={k} className={`flex items-center gap-3 px-4 py-3 transition-colors ${isChecked ? "bg-orange-50" : "hover:bg-slate-50"}`}>
                        <button
                          type="button"
                          onClick={() => setAddFoodCheck((prev) => ({ ...prev, [k]: { checked: !prev[k]?.checked, quantity: prev[k]?.quantity ?? "" } }))}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? "bg-orange-500 border-orange-500" : "border-slate-300 hover:border-orange-400"}`}
                        >
                          {isChecked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </button>
                        <span className={`flex-1 text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}
                          onClick={() => setAddFoodCheck((prev) => ({ ...prev, [k]: { checked: !prev[k]?.checked, quantity: prev[k]?.quantity ?? "" } }))}>
                          {label}
                        </span>
                        {isChecked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <label className="text-xs text-slate-400 whitespace-nowrap">الكمية:</label>
                            <input type="number" min={1} value={state?.quantity ?? ""}
                              onChange={(e) => setAddFoodCheck((prev) => ({ ...prev, [k]: { checked: true, quantity: e.target.value } }))}
                              placeholder="0"
                              className="w-16 border border-orange-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Summary */}
          {Object.values(addFoodCheck).some((s) => s.checked) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(addFoodCheck).filter(([, s]) => s.checked).map(([k, s]) => {
                const [catId, opt] = k.split(":::");
                const cat = foodCategories.find((c) => c.id === catId)!;
                return <span key={k} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{opt || cat?.name}{s.quantity ? ` × ${s.quantity}` : ""}</span>;
              })}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowFoodForm(false)}>إلغاء</Button>
            <Button onClick={handleAddFoodBatch} loading={saving} disabled={!Object.values(addFoodCheck).some((s) => s.checked)}>إضافة</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteFoodTarget}
        onClose={() => setDeleteFoodTarget(null)}
        onConfirm={handleDeleteFood}
        title="حذف قسم المأكولات"
        message={`هل أنت متأكد من حذف "${deleteFoodTarget?.categoryName} — ${deleteFoodTarget?.selectedOption}" من الحفلة؟`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* Edit Concert Date Modal */}
      <Modal open={showEditDate} onClose={() => setShowEditDate(false)} title="تعديل تاريخ الحفلة">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">تاريخ الحفلة</label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditDate(false)}>إلغاء</Button>
            <Button onClick={handleSaveDate} loading={saving} disabled={!editDate}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Venue Name Modal */}
      <Modal open={showEditVenueName} onClose={() => setShowEditVenueName(false)} title="تعديل اسم المكان">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              اسم المكان <span className="text-slate-400 font-normal">— اتركه فارغاً لإزالته</span>
            </label>
            <input
              type="text"
              value={editVenueName}
              onChange={(e) => setEditVenueName(e.target.value)}
              placeholder="مثال: قاعة الفريج — حي النرجس"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditVenueName(false)}>إلغاء</Button>
            <Button onClick={handleSaveVenueName} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Hall Cost Modal */}
      <Modal open={showEditHallCost} onClose={() => setShowEditHallCost(false)} title="تعديل مبلغ القاعة">
        <div className="space-y-4">
          <div className="flex gap-2">
            {[
              { value: "none", label: "بدون" },
              { value: "percentage", label: "نسبة %" },
              { value: "fixed", label: "مبلغ ثابت" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEditHallCostType(opt.value as typeof editHallCostType)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                  editHallCostType === opt.value
                    ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {editHallCostType !== "none" && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                {editHallCostType === "percentage" ? "النسبة المئوية" : "المبلغ (ريال)"}
              </label>
              <input
                type="number"
                min={0}
                step={editHallCostType === "percentage" ? "0.1" : "0.01"}
                max={editHallCostType === "percentage" ? 100 : undefined}
                value={editHallCostValue}
                onChange={(e) => setEditHallCostValue(e.target.value)}
                placeholder={editHallCostType === "percentage" ? "مثال: 10" : "0.00"}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
                autoFocus
              />
              {editHallCostType === "percentage" && editHallCostValue && concert && (
                <p className="text-xs text-slate-400 mt-1">
                  = {((concert.price ?? 0) * parseFloat(editHallCostValue || "0") / 100).toLocaleString("ar-SA")} ريال
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                تاريخ تسليم المبلغ <span className="text-slate-400 font-normal">(اختياري)</span>
              </label>
              <input
                type="date"
                value={editHallCostDate}
                onChange={(e) => setEditHallCostDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                اسم المستلم <span className="text-slate-400 font-normal">(اختياري)</span>
              </label>
              <input
                type="text"
                value={editHallCostRecipient}
                onChange={(e) => setEditHallCostRecipient(e.target.value)}
                placeholder="اسم الشخص المستلم"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditHallCost(false)}>إلغاء</Button>
            <Button onClick={handleSaveHallCost} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Notes Modal */}
      <Modal open={showEditNotes} onClose={() => setShowEditNotes(false)} title="تعديل الملاحظات">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              الملاحظات <span className="text-slate-400 font-normal">— اتركها فارغة لحذفها</span>
            </label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="أي ملاحظات خاصة بالحفلة..."
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] resize-none"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditNotes(false)}>إلغاء</Button>
            <Button onClick={handleSaveNotes} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Transport Cost Modal */}
      <Modal open={showEditTransport} onClose={() => setShowEditTransport(false)} title="تعديل تكلفة النقل">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              تكلفة النقل (ريال) <span className="text-slate-400 font-normal">— اتركه فارغاً لإزالتها</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={editTransportCost}
              onChange={(e) => setEditTransportCost(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditTransport(false)}>إلغاء</Button>
            <Button onClick={handleSaveTransport} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Labor Cost Modal */}
      <Modal open={showEditLabor} onClose={() => setShowEditLabor(false)} title="تعديل تكلفة العمالة">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">عدد العمالة</label>
              <input
                type="number"
                min={0}
                step="1"
                value={editLaborCount}
                onChange={(e) => setEditLaborCount(e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">سعر الواحد (ريال)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editLaborPricePerUnit}
                onChange={(e) => setEditLaborPricePerUnit(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              />
            </div>
          </div>
          {editLaborCount && editLaborPricePerUnit && (
            <div className="flex justify-between px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <span className="text-sm font-semibold text-blue-700">الإجمالي</span>
              <span className="font-bold text-blue-700">
                {(parseInt(editLaborCount) * parseFloat(editLaborPricePerUnit)).toLocaleString("ar-SA")} ريال
              </span>
            </div>
          )}
          <p className="text-xs text-slate-400">اتركهما فارغَين لإزالة تكلفة العمالة</p>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditLabor(false)}>إلغاء</Button>
            <Button onClick={handleSaveLabor} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Price Modal */}
      <Modal open={showEditPrice} onClose={() => setShowEditPrice(false)} title="تعديل سعر الحفلة">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">السعر الجديد (ريال)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditPrice(false)}>إلغاء</Button>
            <Button onClick={handleSavePrice} loading={saving} disabled={!editPrice}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Location Modal */}
      <Modal open={showEditLocation} onClose={() => setShowEditLocation(false)} title="تعديل الموقع">
        <div className="space-y-4">
          <LocationPickerDynamic value={editLocation} onChange={setEditLocation} />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditLocation(false)}>إلغاء</Button>
            <Button onClick={handleSaveLocation} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Supervisors Modal */}
      <Modal open={showEditSupervisors} onClose={() => setShowEditSupervisors(false)} title="تعديل المشرفين">
        <div className="space-y-4">
          {allSupervisors.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مشرفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allSupervisors.map((s) => {
                const selected = editSupervisorIds.includes(s.uid);
                return (
                  <button
                    key={s.uid}
                    type="button"
                    onClick={() => setEditSupervisorIds((prev) =>
                      selected ? prev.filter((id) => id !== s.uid) : [...prev, s.uid]
                    )}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      selected ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] text-xs font-bold shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditSupervisors(false)}>إلغاء</Button>
            <Button onClick={handleSaveSupervisors} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Employees Modal */}
      <Modal open={showEditEmployees} onClose={() => setShowEditEmployees(false)} title="تعديل الموظفين">
        <div className="space-y-4">
          {allEmployees.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد موظفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allEmployees.map((e) => {
                const selected = editEmployeeIds.includes(e.uid);
                return (
                  <button
                    key={e.uid}
                    type="button"
                    onClick={() => setEditEmployeeIds((prev) =>
                      selected ? prev.filter((id) => id !== e.uid) : [...prev, e.uid]
                    )}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      selected ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold shrink-0">
                      {e.name.charAt(0)}
                    </div>
                    {e.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400">اختياري — يمكن ترك الموظفين فارغاً</p>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditEmployees(false)}>إلغاء</Button>
            <Button onClick={handleSaveEmployees} loading={saving}>حفظ</Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Concert Modal */}
      <Modal open={showCancelModal} onClose={() => setShowCancelModal(false)} title="إلغاء العقد">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            سيتم تغيير حالة الحفلة إلى "ملغاة" ولن تُحسب في القوائم المالية.
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">سبب الإلغاء (اختياري)</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="مثال: طلب العميل، ظروف طارئة..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cancelHasRefund}
              onChange={(e) => setCancelHasRefund(e.target.checked)}
              className="w-4 h-4 rounded accent-red-600"
            />
            <span className="text-sm font-semibold text-slate-700">يوجد مبلغ مسترد للعميل</span>
          </label>
          {cancelHasRefund && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">مبلغ الاسترداد (ريال)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cancelRefundAmount}
                    onChange={(e) => setCancelRefundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">تاريخ الاسترداد</label>
                  <input
                    type="date"
                    value={cancelRefundDate}
                    onChange={(e) => setCancelRefundDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">طريقة الاسترداد</label>
                <div className="flex gap-2">
                  {(["cash", "card", "bank_transfer"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCancelRefundMethod(m)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        cancelRefundMethod === m
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {m === "cash" ? "كاش" : m === "card" ? "شبكة" : "تحويل"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowCancelModal(false)}>تراجع</Button>
            <button
              onClick={handleCancelConcert}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
