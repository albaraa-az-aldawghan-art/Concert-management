"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertById, getConcertItems, updateConcert, updateConcertItem, updateConcertItemCount, deleteConcertItem, addConcertItem, getConcertPayments, addConcertPayment, updateConcertPayment, deleteConcertPayment, addConcertLog, getConcertLogs, markConcertAsPaid, updateConcertItemCosts, cancelConcert } from "@/lib/firestore/concerts";
import { getMissingItemsByConcert } from "@/lib/firestore/missing-items";
import { getFoodCategories, getConcertFood, addConcertFood, updateConcertFood, deleteConcertFood } from "@/lib/firestore/food";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUserById, getUsersByRole } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { PaymentInvoiceFields, defaultInvoiceFor, invoiceLabel, InvoiceState } from "@/components/ui/payment-invoice-fields";
import { Concert, ConcertItem, MissingItem, AppUser, FoodCategory, ConcertFood, ConcertPayment, PaymentMethod, WarehouseItem, ConcertLocation, ConcertLog, KitchenOrder, CostOutgoing, ConcertExpense, ExpenseType, CostItem } from "@/types";
import { sendConcertToKitchen, getKitchenOrderByConcert, sendConcertToWarehouse } from "@/lib/firestore/kitchen";
import { getCostOutgoingByConcert, getCostItems } from "@/lib/firestore/costs";
import { aggregateRequirements, totalEstimatedCost, optionStock, optionCostBarcode } from "@/lib/recipes";
import { getExpensesByConcert, getExpenseSettings, addConcertExpense, deleteConcertExpense } from "@/lib/firestore/expenses";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { normalizeStatus, operationalStage } from "@/lib/concert-status";
import { thumbUrl } from "@/lib/cloudinary";
import { Calendar, MapPin, Users, Package, AlertTriangle, Pencil, Trash2, ChevronRight, Phone, UserRound, BadgeDollarSign, UtensilsCrossed, Plus, Banknote, CreditCard, Landmark, CalendarDays, Building2, Hash, CheckCircle2, Circle, Check, Banknote as BanknoteIcon, FileText, XCircle, Search, Navigation, UsersRound, Barcode, Receipt } from "lucide-react";
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
  const { appUser, feat } = useAuth();

  const [concert, setConcert] = useState<Concert | null>(null);
  const [items, setItems] = useState<ConcertItem[]>([]);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [costOutgoing, setCostOutgoing] = useState<CostOutgoing[]>([]);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [allEmployees, setAllEmployees] = useState<AppUser[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteItemTarget, setDeleteItemTarget] = useState<ConcertItem | null>(null);
  const [editItemQtyTarget, setEditItemQtyTarget] = useState<ConcertItem | null>(null);
  const [editItemQtyValue, setEditItemQtyValue] = useState("");
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
  /* ── فواتير مصروفات الحفلة ── */
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [expenses, setExpenses] = useState<ConcertExpense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<ConcertExpense | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    type: "",
    amount: "",
    vatIncluded: false,
    invoiceDate: "",
    supplierName: "",
    description: "",
  });
  const [showEditDate, setShowEditDate] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [showEditVenueName, setShowEditVenueName] = useState(false);
  const [editVenueName, setEditVenueName] = useState("");
  const [showEditPeopleCount, setShowEditPeopleCount] = useState(false);
  const [editPeopleCount, setEditPeopleCount] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelHasRefund, setCancelHasRefund] = useState(false);
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  const [cancelRefundDate, setCancelRefundDate] = useState("");
  const [cancelRefundMethod, setCancelRefundMethod] = useState<PaymentMethod>("cash");
  const [logs, setLogs] = useState<ConcertLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [paidSaving, setPaidSaving] = useState(false);

  const [payments, setPayments] = useState<ConcertPayment[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<ConcertPayment | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<ConcertPayment | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceState>({ hasInvoice: null, invoiceRegistered: null });
  const [paymentForm, setPaymentForm] = useState({
    method: "card" as PaymentMethod,
    amount: "",
    date: "",
    cardType: "visa" as "visa" | "mada",
    receiverName: "",
    bankName: "",
    senderName: "",
    hasInvoice: true as boolean | null,
    invoiceRegistered: null as boolean | null,
  });

  const [foodCategories, setFoodCategories] = useState<FoodCategory[]>([]);
  const [concertFood, setConcertFood] = useState<ConcertFood[]>([]);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [deleteFoodTarget, setDeleteFoodTarget] = useState<ConcertFood | null>(null);
  const [editFoodQtyTarget, setEditFoodQtyTarget] = useState<ConcertFood | null>(null);
  const [editFoodQtyValue, setEditFoodQtyValue] = useState("");
  const [addFoodCategoryId, setAddFoodCategoryId] = useState("");
  const [addFoodCheck, setAddFoodCheck] = useState<Record<string, { checked: boolean; quantity: string }>>({});
  const [addFoodSearch, setAddFoodSearch] = useState("");

  const [addItemType, setAddItemType] = useState<"" | "internal" | "external">("");
  const [addItemCheck, setAddItemCheck] = useState<Record<string, { checked: boolean; quantity: string }>>({});
  const [addItemSearch, setAddItemSearch] = useState("");

  const [kitchenOrder, setKitchenOrder] = useState<KitchenOrder | null>(null);
  const [sendingKitchen, setSendingKitchen] = useState(false);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    // Each secondary read falls back to empty on failure (e.g. Firestore rules
    // lag behind a new collection) — one denied read must never brick the page.
    const [concertData, itemsData, missingData, foodCats, foodItems, paymentsData, warehouseData, allSups, allEmps, logsData, kitchenData, costOutgoingData, expensesData, expenseSettings, costItemsData] = await Promise.all([
      getConcertById(id),
      getConcertItems(id).catch(() => []),
      getMissingItemsByConcert(id).catch(() => []),
      getFoodCategories().catch(() => []),
      getConcertFood(id).catch(() => []),
      getConcertPayments(id).catch(() => []),
      getWarehouseItems().catch(() => []),
      getUsersByRole("supervisor").catch(() => []),
      getUsersByRole("employee").catch(() => []),
      getConcertLogs(id).catch(() => []),
      getKitchenOrderByConcert(id).catch(() => null),
      getCostOutgoingByConcert(id).catch(() => []),
      getExpensesByConcert(id).catch(() => []),
      getExpenseSettings().catch(() => ({ types: [] })),
      getCostItems().catch(() => [] as CostItem[]),
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
    setKitchenOrder(kitchenData);
    setCostOutgoing(costOutgoingData);
    setExpenses(expensesData);
    setExpenseTypes(expenseSettings.types);
    setCostItems(costItemsData);

    if (concertData) {
      const supData = await Promise.all(concertData.supervisorIds.map((uid) => getUserById(uid).catch(() => null)));
      const empData = await Promise.all(concertData.employeeIds.map((uid) => getUserById(uid).catch(() => null)));
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
      // Log each item separately with structured data for contract change tracking
      await Promise.all(entries.map(([k, s]) => {
        const [catId, opt] = k.split(":::");
        const cat = foodCategories.find((c) => c.id === catId)!;
        const optName = opt || cat.name;
        return addConcertLog({
          concertId: id,
          description: `تمت إضافة صنف: ${cat.name}${opt ? " — " + opt : ""}`,
          createdBy: appUser.uid,
          field: "foodAdded",
          newValue: `${cat.name}:::${optName}:::${s.quantity || "0"}`,
        });
      }));
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

  async function handleSaveFoodQty() {
    if (!editFoodQtyTarget || !appUser) return;
    const newQty = parseInt(editFoodQtyValue);
    if (isNaN(newQty) || newQty < 0) { showToast("كمية غير صحيحة", "error"); return; }
    const oldQty = editFoodQtyTarget.quantity ?? 0;
    if (newQty === oldQty) { setEditFoodQtyTarget(null); return; }
    setSaving(true);
    try {
      await updateConcertFood(editFoodQtyTarget.id, { quantity: newQty });
      await addConcertLog({
        concertId: id,
        description: `تم تعديل كمية ${editFoodQtyTarget.categoryName} — ${editFoodQtyTarget.selectedOption} من ${oldQty} إلى ${newQty}`,
        createdBy: appUser.uid,
        field: "foodQty",
        oldValue: `${editFoodQtyTarget.categoryName}:::${editFoodQtyTarget.selectedOption}:::${oldQty}`,
        newValue: `${editFoodQtyTarget.categoryName}:::${editFoodQtyTarget.selectedOption}:::${newQty}`,
      });
      showToast("تم تعديل الكمية");
      setEditFoodQtyTarget(null);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveItemQty() {
    if (!editItemQtyTarget || !appUser || !concert) return;
    const newCount = parseInt(editItemQtyValue);
    if (isNaN(newCount) || newCount < 1) { showToast("كمية غير صحيحة", "error"); return; }
    const oldCount = editItemQtyTarget.count;
    if (newCount === oldCount) { setEditItemQtyTarget(null); return; }
    setSaving(true);
    try {
      const newTotalCost = editItemQtyTarget.unitCost != null ? newCount * editItemQtyTarget.unitCost : editItemQtyTarget.totalCost;
      // يعدّل الحجز في الموارد بالفرق داخل معاملة قبل حفظ الكمية الجديدة
      await updateConcertItemCount(editItemQtyTarget.id, newCount);
      await updateConcertItem(editItemQtyTarget.id, { totalCost: newTotalCost });
      await updateConcertItemCosts(concert.id);
      await addConcertLog({
        concertId: id,
        description: `تم تعديل كمية ${editItemQtyTarget.itemName} من ${oldCount} إلى ${newCount}${editItemQtyTarget.type === "external" && newTotalCost != null ? ` (التكلفة: ${newTotalCost.toLocaleString("en-US")} ريال)` : ""}`,
        createdBy: appUser.uid,
        field: "itemQty",
        oldValue: `${editItemQtyTarget.itemName}:::${oldCount}`,
        newValue: `${editItemQtyTarget.itemName}:::${newCount}`,
      });
      showToast("تم تعديل الكمية");
      setEditItemQtyTarget(null);
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
      await addConcertLog({
        concertId: id,
        description: `تم حذف صنف: ${deleteFoodTarget.categoryName} — ${deleteFoodTarget.selectedOption}`,
        createdBy: appUser.uid,
        field: "foodDeleted",
        oldValue: `${deleteFoodTarget.categoryName}:::${deleteFoodTarget.selectedOption}:::${deleteFoodTarget.quantity ?? 0}`,
      });
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
        hasInvoice: paymentForm.method === "card" ? true : paymentForm.hasInvoice,
        invoiceRegistered: (paymentForm.method === "card" || paymentForm.hasInvoice) ? paymentForm.invoiceRegistered : null,
        createdBy: appUser.uid,
      });
      showToast("تمت إضافة الدفعة");
      setShowPaymentForm(false);
      setPaymentForm({ method: "card", amount: "", date: "", cardType: "visa", receiverName: "", bankName: "", senderName: "", hasInvoice: true, invoiceRegistered: null });
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  /* حالة الفاتورة تُراجَع بعد أيام عادةً — فتُعدَّل وحدها دون المساس
     بالمبلغ، لأن تغيير المبلغ يستوجب إعادة حساب المدفوع. */
  function openInvoiceEdit(p: ConcertPayment) {
    setInvoiceTarget(p);
    setInvoiceDraft({ hasInvoice: p.hasInvoice ?? null, invoiceRegistered: p.invoiceRegistered ?? null });
  }

  async function handleSaveInvoice() {
    if (!invoiceTarget) return;
    setSaving(true);
    try {
      await updateConcertPayment(invoiceTarget.id, {
        hasInvoice: invoiceTarget.method === "card" ? true : invoiceDraft.hasInvoice,
        invoiceRegistered: (invoiceTarget.method === "card" || invoiceDraft.hasInvoice) ? invoiceDraft.invoiceRegistered : null,
      });
      showToast("تم تحديث حالة الفاتورة");
      setInvoiceTarget(null);
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
      await updateConcertItemCosts(concert.id);
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
      for (const [itemId, s] of entries) {
        const item = warehouseItems.find((i) => i.id === itemId)!;
        const count = parseInt(s.quantity) || 1;
        const unitCost = item.pricePerUnit ?? null;
        const totalCost = unitCost != null ? unitCost * count : null;
        await addConcertItem({ concertId: concert.id, itemId: item.id, itemName: item.name, type: item.type, count, unitCost, totalCost, assignedToEmployeeId: null, assignedToEmployeeName: null });
      }
      await updateConcertItemCosts(concert.id);
      const names = entries.map(([itemId, s]) => { const item = warehouseItems.find((i) => i.id === itemId)!; return `${item.name} × ${parseInt(s.quantity) || 1}`; }).join("، ");
      await addConcertLog({ concertId: concert.id, description: `تمت إضافة مواد: ${names}`, createdBy: appUser.uid });
      showToast("تمت إضافة المواد");
      setShowItemForm(false);
      setAddItemType("");
      setAddItemCheck({});
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
      loadData();
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
      await addConcertLog({
        concertId: concert.id,
        description: `تم تغيير سعر الحفلة من ${oldPrice?.toLocaleString("en-US")} ريال إلى ${price.toLocaleString("en-US")} ريال`,
        createdBy: appUser.uid,
        field: "price",
        oldValue: String(oldPrice ?? 0),
        newValue: String(price),
      });
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

  function openAddExpense() {
    setExpenseForm({
      type: expenseTypes[0]?.name ?? "",
      amount: "",
      vatIncluded: false,
      invoiceDate: new Date().toISOString().slice(0, 10),
      supplierName: "",
      description: "",
    });
    setShowAddExpense(true);
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!concert || !appUser) return;
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0) { showToast("أدخل مبلغاً صحيحاً", "error"); return; }
    const picked = expenseTypes.find((t) => t.name === expenseForm.type);
    if (!picked) { showToast("اختر نوع المصروف", "error"); return; }
    setSaving(true);
    try {
      await addConcertExpense({
        concertId: concert.id,
        concertNumber: concert.concertNumber ?? null,
        clientName: concert.clientName ?? null,
        type: picked.name,
        kind: picked.kind,
        description: expenseForm.description.trim() || null,
        supplierName: expenseForm.supplierName.trim() || null,
        amount,
        vatIncluded: expenseForm.vatIncluded,
        invoiceDate: expenseForm.invoiceDate,
        createdBy: appUser.uid,
      });
      await addConcertLog({
        concertId: concert.id,
        description: `أُضيفت فاتورة ${picked.name} بمبلغ ${amount.toLocaleString("en-US")} ريال`,
        createdBy: appUser.uid,
      });
      showToast("تمت إضافة الفاتورة");
      setShowAddExpense(false);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense() {
    if (!deleteExpenseTarget || !appUser || !concert) return;
    setSaving(true);
    try {
      await deleteConcertExpense(deleteExpenseTarget);
      await addConcertLog({
        concertId: concert.id,
        description: `حُذفت فاتورة ${deleteExpenseTarget.type} بمبلغ ${deleteExpenseTarget.amount.toLocaleString("en-US")} ريال`,
        createdBy: appUser.uid,
      });
      showToast("تم حذف الفاتورة");
      setDeleteExpenseTarget(null);
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

  async function handleSavePeopleCount() {
    if (!concert || !appUser) return;
    setSaving(true);
    try {
      const oldCount = concert.peopleCount || "—";
      const newCount = editPeopleCount.trim() || null;
      await updateConcert(concert.id, { peopleCount: newCount });
      await addConcertLog({ concertId: concert.id, description: `تم تغيير عدد الأشخاص من "${oldCount}" إلى "${newCount ?? "—"}"`, createdBy: appUser.uid, field: "peopleCount", oldValue: oldCount, newValue: newCount ?? "" });
      showToast("تم تحديث عدد الأشخاص");
      setShowEditPeopleCount(false);
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
      // editDate is datetime-local ("YYYY-MM-DDTHH:mm") — keeps the concert time
      const newTimestamp = Timestamp.fromDate(new Date(editDate));
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

  // Feature-level permissions for this page: each capability is granted
  // individually from the role's checklist (admin gets everything).
  const fx = {
    edit: feat("concerts", "edit"),
    assign: feat("concerts", "assign"),
    payments: feat("concerts", "payments"),
    materials: feat("concerts", "materials"),
    food: feat("concerts", "food_items"),
    kitchen: feat("concerts", "send_kitchen"),
    stages: feat("concerts", "stages"),
    contract: feat("concerts", "contract"),
    cancel: feat("concerts", "cancel"),
  };
  const hasAnyPower = Object.values(fx).some(Boolean);

  /* فواتير المصروفات — تُدخَل للحفلة المؤكدة أو المكتملة فقط. فاتورة
     السيارة كثيراً ما تصل بعد انتهاء الحفلة، فحصرها في «مؤكدة» يعطّل العمل. */
  const expenseStatus = normalizeStatus(concert.status);
  const expenseStageOk = expenseStatus === "confirmed" || expenseStatus === "completed";
  const canAddExpense = (fx.payments || fx.edit) && expenseStageOk;
  const expenseGateReason =
    expenseStatus === "planned" ? "تُضاف بعد تأكيد الحفلة"
    : expenseStatus === "cancelled" ? "الحفلة ملغاة"
    : "لا صلاحية للإضافة";
  const expensesTotal = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  const addFoodRequirements = aggregateRequirements(
    Object.entries(addFoodCheck)
      .filter(([, st]) => st.checked)
      .map(([k, st]) => {
        const [catId, opt] = k.split(":::");
        const cat = foodCategories.find((c) => c.id === catId);
        return { categoryId: catId, selectedOption: opt || cat?.name || "", quantity: parseInt(st.quantity) || 0 };
      }),
    foodCategories,
    costItems
  );
  const addFoodEstimatedCost = totalEstimatedCost(addFoodRequirements);

  // Safety net for pure-view roles: block any button that slipped past the
  // per-feature rendering below.
  function blockIfViewOnly(e: React.MouseEvent) {
    if (hasAnyPower || appUser?.role !== "custom") return;
    const btn = (e.target as HTMLElement).closest("button");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      showToast("صلاحيتك على الحفلات «عرض فقط»", "error");
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5" onClickCapture={blockIfViewOnly}>
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
          {fx.contract && (
            <a
              href={`/contract/${concert.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1C2D50] text-white hover:bg-[#111D35] transition-colors"
            >
              <FileText size={15} />
              عرض الاتفاقية
            </a>
          )}
          {fx.kitchen && normalizeStatus(concert.status) !== "cancelled" && (
            <button
              onClick={async () => {
                if (!appUser || sendingKitchen) return;
                setSendingKitchen(true);
                try {
                  await Promise.all([
                    sendConcertToKitchen(concert, appUser.name),
                    sendConcertToWarehouse(concert, appUser.name),
                  ]);
                  setKitchenOrder(await getKitchenOrderByConcert(concert.id));
                  showToast(kitchenOrder ? "تم إعادة الإرسال للمطبخ والموارد" : "تم إرسال الحفلة للمطبخ والموارد");
                } catch {
                  showToast("حدث خطأ أثناء الإرسال", "error");
                } finally {
                  setSendingKitchen(false);
                }
              }}
              disabled={sendingKitchen}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                kitchenOrder?.status === "received"
                  ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                  : kitchenOrder
                  ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              <UtensilsCrossed size={15} />
              {sendingKitchen
                ? "جارٍ الإرسال..."
                : kitchenOrder?.status === "received"
                ? "المطبخ استلم ✓ — إعادة إرسال"
                : kitchenOrder
                ? "أُرسل للمطبخ والموارد — إعادة إرسال"
                : "إرسال للمطبخ والموارد"}
            </button>
          )}
          {fx.cancel && normalizeStatus(concert.status) !== "cancelled" && (
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
      {normalizeStatus(concert.status) === "cancelled" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <XCircle size={16} />
            هذه الحفلة ملغاة
          </div>
          {concert.cancellationReason && <p className="text-sm text-red-600">السبب: {concert.cancellationReason}</p>}
          {concert.refundAmount && concert.refundAmount > 0 && (
            <p className="text-sm text-red-600">
              المبلغ المسترد: {concert.refundAmount.toLocaleString("en-US")} ريال
              {concert.refundDate && ` — بتاريخ ${concert.refundDate}`}
            </p>
          )}
        </div>
      )}

      {/* ── Pipeline ── مراحل الحفلة التسلسلية */}
      {fx.stages && (() => {
        const stage = operationalStage(concert);
        const isCancelled = normalizeStatus(concert.status) === "cancelled";
        return (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">سير عمل الحفلة</h3>
              <span className="text-xs font-semibold text-slate-500">
                {concert.warehouseReturnConfirmed ? "اكتمل التشغيل ✓" : `${stage.done} من ${stage.steps.length}`}
              </span>
            </div>

            {/* قائمة إنجاز خطوات المشرف — مشتقة من العلامات المحفوظة لا من الحالة */}
            <div className="space-y-2">
              {stage.steps.map((s, i) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 ${
                    s.done ? "bg-green-500 border-green-500" : "bg-white border-slate-200"
                  }`}>
                    {s.done
                      ? <Check size={12} className="text-white" />
                      : <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>}
                  </div>
                  <p className={`text-sm ${s.done ? "text-slate-700 font-medium" : "text-slate-400"}`}>{s.label}</p>
                </div>
              ))}
            </div>

            {!isCancelled && (
              <div className="mt-3 rounded-xl px-4 py-2.5 text-xs bg-[#EEF1F7] border border-[#D4DCE8] text-[#1C2D50] font-semibold">
                {concert.warehouseReturnConfirmed
                  ? "تم استلام كل المواد من الحفلة"
                  : stage.next
                    ? `الخطوة التالية: ${stage.next}`
                    : "بانتظار تأكيد مدير الموارد لاستلام المواد"}
              </div>
            )}

            {/* التسوية المالية — لم تعد مرهونة بمرحلة وسيطة، وإلا تعذّر إغلاق
                أي حفلة (ومنها الحفلات بلا مواد أصلاً) */}
            {!concert.isPaid && !isCancelled && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">الخطوة التالية — التسوية المالية</p>
                {!concert.warehouseReturnConfirmed && stage.done > 0 && (
                  <p className="text-xs text-orange-600 mb-2">⚠ لم يُؤكَّد استلام مواد الحفلة من المشرف بعد</p>
                )}
                <Button onClick={handleMarkAsPaid} loading={paidSaving} disabled={!fx.payments} className="w-full gap-2">
                  <CheckCircle2 size={16} />
                  تأكيد التسوية المالية وإغلاق الحفلة
                </Button>
              </div>
            )}
            {concert.isPaid && (
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
            {fx.edit && <button
              onClick={() => {
                const d = concert.date?.toDate();
                const str = d
                  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
                  : "";
                setEditDate(str);
                setShowEditDate(true);
              }}
              className="text-slate-300 hover:text-blue-500 transition-colors"
            >
              <Pencil size={13} />
            </button>}
          </div>
          <p className="font-semibold text-slate-800 text-sm">{formatDate(concert.date)}</p>
          <p className="text-xs text-[#1C2D50] font-bold mt-0.5 tabular-nums-auto">🕐 {formatTime(concert.date)}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <BadgeDollarSign size={15} />
              <span className="text-xs font-medium">سعر الحفلة</span>
            </div>
            {fx.edit && <button onClick={() => { setEditPrice(String(concert.price ?? "")); setShowEditPrice(true); }} className="text-slate-300 hover:text-blue-500 transition-colors">
              <Pencil size={13} />
            </button>}
          </div>
          <p className="font-bold text-green-700 text-lg">{concert.price?.toLocaleString("en-US")} ريال</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <MapPin size={15} />
              <span className="text-xs font-medium">الموقع</span>
            </div>
            {fx.edit && <button onClick={() => { setEditLocation(concert.location ?? null); setShowEditLocation(true); }} className="text-slate-300 hover:text-blue-500 transition-colors">
              <Pencil size={13} />
            </button>}
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.location?.address || "—"}</p>
          {concert.location && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${concert.location.lat},${concert.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 bg-[#1C2D50] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#111D35] transition-colors shadow-sm"
            >
              <Navigation size={12} />
              توجه بخرائط Google
            </a>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Building2 size={15} />
              <span className="text-xs font-medium">اسم المكان</span>
            </div>
            {fx.edit && <button
              onClick={() => { setEditVenueName(concert.venueName ?? ""); setShowEditVenueName(true); }}
              className="text-slate-300 hover:text-blue-500 transition-colors"
            >
              <Pencil size={13} />
            </button>}
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.venueName || "—"}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <UsersRound size={15} />
              <span className="text-xs font-medium">عدد الأشخاص</span>
            </div>
            {fx.edit && <button
              onClick={() => { setEditPeopleCount(concert.peopleCount ?? ""); setShowEditPeopleCount(true); }}
              className="text-slate-300 hover:text-blue-500 transition-colors"
            >
              <Pencil size={13} />
            </button>}
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.peopleCount || "—"}</p>
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
            {fx.edit && <button
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
            </button>}
          </div>
          {concert.hallCostType === "percentage" ? (
            <div>
              <p className="font-bold text-slate-800 text-lg">{concert.hallCostValue}%</p>
              <p className="text-xs text-slate-400">= {((concert.price ?? 0) * (concert.hallCostValue ?? 0) / 100).toLocaleString("en-US")} ريال</p>
            </div>
          ) : concert.hallCostType === "fixed" ? (
            <p className="font-bold text-slate-800 text-lg">{concert.hallCostValue?.toLocaleString("en-US")} ريال</p>
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

        {/* مصاريف الحفلة — فواتير. المجاميع مشتقّة منها ولا تُحرَّر يدوياً */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Receipt size={15} />
              <span className="text-xs font-medium">مصاريف الحفلة</span>
            </div>
            {canAddExpense && (
              <button
                onClick={openAddExpense}
                className="flex items-center gap-1 text-xs font-medium text-[#1C2D50] hover:text-[#111D35] bg-[#EEF1F7] hover:bg-[#D4DCE8] px-2 py-0.5 rounded-lg transition-colors"
              >
                <Plus size={11} />
                فاتورة
              </button>
            )}
          </div>
          {expensesTotal > 0 ? (
            <div>
              <p className="font-bold text-slate-800 text-lg tabular-nums-auto">
                {expensesTotal.toLocaleString("en-US")} ريال
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{expenses.length} فاتورة</p>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">
              {canAddExpense ? "لم تُضَف فواتير بعد" : expenseGateReason}
            </p>
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
            style={fx.edit ? undefined : { display: "none" }}
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
            <p className="font-bold text-slate-800 text-lg">{concert.price?.toLocaleString("en-US")} ريال</p>
          </div>
          <div className="bg-[#EEF1F7] rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">إجمالي المدفوع</p>
            <p className="font-bold text-[#1C2D50] text-lg">
              {concert.deposit ? `${concert.deposit.toLocaleString("en-US")} ريال` : "—"}
            </p>
          </div>
          <div className="bg-orange-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">المبلغ المتبقي</p>
            <p className="font-bold text-orange-700 text-lg">
              {((concert.price ?? 0) - (concert.deposit ?? 0)).toLocaleString("en-US")} ريال
            </p>
          </div>
        </div>

        {fx.payments && (
          <Button onClick={() => setShowPaymentForm(true)} variant="outline" className="mb-4">
            <Plus size={16} /> إضافة دفعة
          </Button>
        )}

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
                    <span className="font-bold text-slate-800 text-sm">{p.amount.toLocaleString("en-US")} ريال</span>
                    {(() => {
                      const inv = invoiceLabel(p);
                      return inv ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${inv.cls}`}>{inv.text}</span> : null;
                    })()}
                  </div>
                  <p className="text-xs text-slate-400 pr-5">
                    {p.date}
                    {getPaymentDetail(p) && ` — ${getPaymentDetail(p)}`}
                  </p>
                </div>
                {fx.payments && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openInvoiceEdit(p)} title="تعديل حالة الفاتورة"
                      className="text-slate-300 hover:text-[#1C2D50] transition-colors">
                      <FileText size={14} />
                    </button>
                    <button
                      onClick={() => setDeletePaymentTarget(p)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
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
            {fx.assign && (
              <Button size="sm" variant="outline" onClick={() => { setEditSupervisorIds(concert.supervisorIds); setShowEditSupervisors(true); }}>
                <Pencil size={13} /> تعديل
              </Button>
            )}
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
            {fx.assign && (
              <Button size="sm" variant="outline" onClick={() => { setEditEmployeeIds(concert.employeeIds); setShowEditEmployees(true); }}>
                <Pencil size={13} /> تعديل
              </Button>
            )}
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
          {fx.materials && (
            <Button size="sm" onClick={() => { setAddItemType(""); setAddItemCheck({}); setAddItemSearch(""); setShowItemForm(true); }}>
              <Plus size={14} /> إضافة مادة
            </Button>
          )}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {internalItems.map((item) => (
                    <div key={item.id} className="flex flex-col justify-between gap-2 bg-slate-50 rounded-xl px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {(() => {
                            const img = warehouseItems.find((w) => w.id === item.itemId)?.imageUrl;
                            return img ? (
                              <a href={img} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <img src={thumbUrl(img, 120)} alt={item.itemName} loading="lazy" className="w-11 h-11 object-cover rounded-lg border border-slate-200" />
                              </a>
                            ) : null;
                          })()}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                            {item.assignedToEmployeeName && (
                              <p className="text-xs text-slate-400 mt-0.5">مسند لـ: {item.assignedToEmployeeName}</p>
                            )}
                          </div>
                        </div>
                        {fx.materials && <button onClick={() => setDeleteItemTarget(item)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1 -m-1">
                          <Trash2 size={13} />
                        </button>}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        {editItemQtyTarget?.id === item.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={1} value={editItemQtyValue}
                              onChange={(e) => setEditItemQtyValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSaveItemQty(); if (e.key === "Escape") setEditItemQtyTarget(null); }}
                              className="w-14 text-xs border border-slate-300 rounded px-1.5 py-0.5 text-center bg-white"
                              autoFocus
                            />
                            <button onClick={handleSaveItemQty} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
                            <button onClick={() => setEditItemQtyTarget(null)} className="text-slate-400 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">الكمية:</span>
                            <span className="text-sm font-bold text-[#1C2D50]">{item.count}</span>
                            {fx.materials && <button onClick={() => { setEditItemQtyTarget(item); setEditItemQtyValue(String(item.count)); }} className="text-slate-300 hover:text-blue-500 transition-colors p-1 -m-1">
                              <Pencil size={11} />
                            </button>}
                          </div>
                        )}
                        <StatusBadge status={item.deliveryStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {externalItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">خارجية</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {externalItems.map((item) => (
                    <div key={item.id} className="flex flex-col justify-between gap-2 bg-slate-50 rounded-xl px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {(() => {
                            const img = warehouseItems.find((w) => w.id === item.itemId)?.imageUrl;
                            return img ? (
                              <a href={img} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <img src={thumbUrl(img, 120)} alt={item.itemName} loading="lazy" className="w-11 h-11 object-cover rounded-lg border border-slate-200" />
                              </a>
                            ) : null;
                          })()}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{item.itemName}</p>
                            {item.totalCost != null && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                {item.unitCost?.toLocaleString("en-US")} ريال × {item.count} =
                                <span className="font-bold mr-1">{item.totalCost.toLocaleString("en-US")} ريال</span>
                              </p>
                            )}
                            {item.assignedToEmployeeName && (
                              <p className="text-xs text-slate-400 mt-0.5">مسند لـ: {item.assignedToEmployeeName}</p>
                            )}
                          </div>
                        </div>
                        {fx.materials && <button
                          onClick={() => setDeleteItemTarget(item)}
                          className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1 -m-1"
                        >
                          <Trash2 size={13} />
                        </button>}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        {editItemQtyTarget?.id === item.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={1} value={editItemQtyValue}
                              onChange={(e) => setEditItemQtyValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSaveItemQty(); if (e.key === "Escape") setEditItemQtyTarget(null); }}
                              className="w-14 text-xs border border-slate-300 rounded px-1.5 py-0.5 text-center bg-white"
                              autoFocus
                            />
                            <button onClick={handleSaveItemQty} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
                            <button onClick={() => setEditItemQtyTarget(null)} className="text-slate-400 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">الكمية:</span>
                            <span className="text-sm font-bold text-[#1C2D50]">{item.count}</span>
                            {fx.materials && <button onClick={() => { setEditItemQtyTarget(item); setEditItemQtyValue(String(item.count)); }} className="text-slate-300 hover:text-blue-500 transition-colors p-1 -m-1">
                              <Pencil size={11} />
                            </button>}
                          </div>
                        )}
                        <StatusBadge status={item.returnStatus} />
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
                      <span className="font-bold text-amber-700">{extTotal.toLocaleString("en-US")} ريال</span>
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
          {foodCategories.length > 0 && fx.food && (
            <Button size="sm" onClick={() => { setAddFoodCategoryId(""); setAddFoodCheck({}); setAddFoodSearch(""); setShowFoodForm(true); }}>
              <Plus size={14} /> إضافة
            </Button>
          )}
        </div>
        {concertFood.length === 0 ? (
          <p className="text-sm text-slate-400">لم تتم إضافة أي أصناف أكل لهذه الحفلة</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {concertFood.map((f) => (
              <div key={f.id} className="flex flex-col justify-between gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{f.categoryName}</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{f.selectedOption}</p>
                    {f.notes && <p className="text-xs text-slate-400 mt-0.5">— {f.notes}</p>}
                  </div>
                  {fx.food && <button onClick={() => setDeleteFoodTarget(f)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1 -m-1">
                    <Trash2 size={14} />
                  </button>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-orange-100">
                  {editFoodQtyTarget?.id === f.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">الكمية:</span>
                      <input
                        type="number" min={0} value={editFoodQtyValue}
                        onChange={(e) => setEditFoodQtyValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveFoodQty(); if (e.key === "Escape") setEditFoodQtyTarget(null); }}
                        className="w-14 text-xs border border-orange-300 rounded px-1.5 py-0.5 text-center bg-white"
                        autoFocus
                      />
                      <button onClick={handleSaveFoodQty} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
                      <button onClick={() => setEditFoodQtyTarget(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium">الكمية: <span className="font-bold text-[#1C2D50]">{f.quantity ?? 0}</span></span>
                      {fx.food && <button
                        onClick={() => { setEditFoodQtyTarget(f); setEditFoodQtyValue(String(f.quantity ?? 0)); }}
                        className="text-orange-400 hover:text-orange-600 transition-colors p-1 -m-1"
                        title="تعديل الكمية"
                      >
                        <Pencil size={13} />
                      </button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* فواتير مصاريف الحفلة */}
      {expenses.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Receipt size={16} className="text-[#1C2D50]" />
              مصاريف الحفلة ({expenses.length})
            </h3>
            <span className="font-bold text-[#1C2D50] tabular-nums-auto">
              {expensesTotal.toLocaleString("en-US")} ريال
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-2 font-semibold">النوع</th>
                  <th className="py-2 px-2 font-semibold">المورّد / الوصف</th>
                  <th className="py-2 px-2 font-semibold">التاريخ</th>
                  <th className="py-2 px-2 font-semibold">المبلغ</th>
                  {canAddExpense && <th className="py-2 px-2"></th>}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-none">
                    <td className="py-2 px-2 font-medium text-slate-800">{e.type}</td>
                    <td className="py-2 px-2 text-slate-500 text-xs">
                      {[e.supplierName, e.description].filter(Boolean).join(" — ") || "—"}
                    </td>
                    <td className="py-2 px-2 tabular-nums-auto text-slate-500">{e.invoiceDate}</td>
                    <td className="py-2 px-2 tabular-nums-auto font-semibold text-[#1C2D50]">
                      {e.amount.toLocaleString("en-US")} ريال
                      {e.vatIncluded && <span className="block text-[10px] font-normal text-slate-400">شامل الضريبة</span>}
                    </td>
                    {canAddExpense && (
                      <td className="py-2 px-2">
                        <button onClick={() => setDeleteExpenseTarget(e)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Raw Materials Cost (from التكاليف) */}
      {costOutgoing.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Barcode size={16} className="text-[#1C2D50]" />
              تكلفة المواد الخام ({costOutgoing.length})
            </h3>
            <span className="font-bold text-[#1C2D50] tabular-nums-auto">
              {costOutgoing.reduce((sum, e) => sum + e.totalCost, 0).toLocaleString("en-US")} ريال
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-2 font-semibold">الصنف</th>
                  <th className="py-2 px-2 font-semibold">الكمية</th>
                  <th className="py-2 px-2 font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {costOutgoing.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-none">
                    <td className="py-2 px-2 font-medium text-slate-800">{e.itemName}</td>
                    <td className="py-2 px-2 tabular-nums-auto text-slate-600">{e.quantity.toLocaleString("en-US")} {e.unit}</td>
                    <td className="py-2 px-2 tabular-nums-auto font-semibold text-[#1C2D50]">{e.totalCost.toLocaleString("en-US")} ريال</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
      {fx.stages && <Card>
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
      </Card>}

      {/* Add Payment Modal */}
      <Modal open={showPaymentForm} onClose={() => setShowPaymentForm(false)} title="إضافة دفعة">
        <div className="space-y-4">
          {/* Method Tabs */}
          <div className="flex gap-2">
            {(["card", "cash", "bank_transfer"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentForm({ ...paymentForm, method: m, ...defaultInvoiceFor(m) })}
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

          <PaymentInvoiceFields
            method={paymentForm.method}
            value={{ hasInvoice: paymentForm.hasInvoice, invoiceRegistered: paymentForm.invoiceRegistered }}
            onChange={(v) => setPaymentForm({ ...paymentForm, ...v })}
          />

          {paymentForm.amount && concert && (
            <div className="bg-[#EEF1F7] border border-[#EEF1F7] rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">المتبقي بعد الدفعة</span>
                <span className="font-bold text-orange-700">
                  {((concert.price ?? 0) - (concert.deposit ?? 0) - parseFloat(paymentForm.amount || "0")).toLocaleString("en-US")} ريال
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

      {/* تعديل حالة الفاتورة لدفعة قائمة */}
      <Modal open={!!invoiceTarget} onClose={() => setInvoiceTarget(null)} title="حالة الفاتورة" size="sm">
        {invoiceTarget && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
              <p className="font-bold text-slate-800 text-sm">
                {invoiceTarget.amount.toLocaleString("en-US")} ريال
                <span className="text-xs font-normal text-slate-500 mr-2">{METHOD_LABELS[invoiceTarget.method]}</span>
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums-auto mt-0.5">{invoiceTarget.date}</p>
            </div>

            <PaymentInvoiceFields
              method={invoiceTarget.method}
              value={invoiceDraft}
              onChange={setInvoiceDraft}
            />

            <div className="flex gap-3 justify-end pt-1">
              <Button variant="secondary" type="button" onClick={() => setInvoiceTarget(null)}>إلغاء</Button>
              <Button onClick={handleSaveInvoice} loading={saving}>حفظ</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Payment */}
      <ConfirmModal
        open={!!deletePaymentTarget}
        onClose={() => setDeletePaymentTarget(null)}
        onConfirm={handleDeletePayment}
        title="حذف الدفعة"
        message={`هل أنت متأكد من حذف دفعة بمبلغ ${deletePaymentTarget?.amount.toLocaleString("en-US")} ريال؟`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* Add Items Modal — dropdown → checklist */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title="إضافة مواد للحفلة">
        <div className="space-y-4">
          {/* Type dropdown */}
          <select
            value={addItemType}
            onChange={(e) => { setAddItemType(e.target.value as "" | "internal" | "external"); setAddItemSearch(""); }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">— اختر نوع المواد —</option>
            <option value="internal">داخلي</option>
            <option value="external">خارجي</option>
          </select>

          {/* Search */}
          {addItemType && (
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={addItemSearch}
                onChange={(e) => setAddItemSearch(e.target.value)}
                placeholder="ابحث باسم المادة..."
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
            </div>
          )}

          {/* Checklist */}
          {addItemType && (() => {
            const existingIds = new Set(items.map((i) => i.itemId));
            const q = addItemSearch.trim();
            const typeItems = warehouseItems.filter((i) =>
              i.type === (addItemType === "internal" ? "internal" : "external") &&
              !existingIds.has(i.id) &&
              (q === "" || i.name.includes(q))
            );
            if (typeItems.length === 0) return <p className="text-sm text-slate-400 text-center py-4">{q ? "لا توجد نتائج مطابقة للبحث" : "لا توجد مواد إضافية من هذا النوع"}</p>;
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
                        <div className="flex-1 min-w-0 flex items-center gap-2.5"
                          onClick={() => setAddItemCheck((prev) => ({ ...prev, [item.id]: { checked: !prev[item.id]?.checked, quantity: prev[item.id]?.quantity ?? "1" } }))}>
                          {item.imageUrl && (
                            <img
                              src={thumbUrl(item.imageUrl, 120)}
                              alt={item.name}
                              loading="lazy"
                              className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0 cursor-pointer"
                            />
                          )}
                          <div className="min-w-0">
                            <span className={`text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                              {item.name}
                              <span className="text-xs text-slate-400 mr-1.5">(متوفر: {item.availableCount})</span>
                            </span>
                            {isChecked && hasPrice && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                {item.pricePerUnit!.toLocaleString("en-US")} ريال × {qty} =
                                <span className="font-bold mr-1">{(item.pricePerUnit! * qty).toLocaleString("en-US")} ريال</span>
                              </p>
                            )}
                          </div>
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
            onChange={(e) => { setAddFoodCategoryId(e.target.value); setAddFoodSearch(""); }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
          >
            <option value="">— اختر قسم الأكل —</option>
            {foodCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Search */}
          {addFoodCategoryId && (
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={addFoodSearch}
                onChange={(e) => setAddFoodSearch(e.target.value)}
                placeholder="ابحث باسم الصنف..."
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              />
            </div>
          )}

          {/* Checklist for selected category */}
          {addFoodCategoryId && (() => {
            const cat = foodCategories.find((c) => c.id === addFoodCategoryId);
            if (!cat) return null;
            const existingOptions = new Set(concertFood.filter((f) => f.categoryId === cat.id).map((f) => f.selectedOption));
            const q = addFoodSearch.trim();
            let options = cat.options.length > 0 ? cat.options.filter((o) => !existingOptions.has(o)) : (existingOptions.has(cat.name) ? [] : [""]);
            if (q) options = options.filter((o) => (o || cat.name).includes(q));
            if (options.length === 0) return <p className="text-sm text-slate-400 text-center py-4">{q ? "لا توجد نتائج مطابقة للبحث" : "تمت إضافة جميع أصناف هذا القسم"}</p>;
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
                        <span className={`flex-1 min-w-0 text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}
                          onClick={() => setAddFoodCheck((prev) => ({ ...prev, [k]: { checked: !prev[k]?.checked, quantity: prev[k]?.quantity ?? "" } }))}>
                          {label}
                          {optionCostBarcode(cat, opt) && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold mr-1.5 align-middle">إنتاج</span>
                          )}
                          {(() => {
                            const st = optionStock(cat, opt, parseInt(state?.quantity ?? "") || 0, costItems);
                            if (!st) return null;
                            return (
                              <span className={`block text-[10px] mt-0.5 tabular-nums-auto ${st.short ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                                {st.text}
                              </span>
                            );
                          })()}
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

          {/* احتياج الخامات حسب وصفات ما اختير الآن */}
          {addFoodRequirements.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">الخامات المطلوبة حسب الوصفات</p>
                <span className="text-xs font-bold text-[#1C2D50] tabular-nums-auto">
                  تكلفة تقديرية: {addFoodEstimatedCost.toLocaleString("en-US")} ريال
                </span>
              </div>
              <div className="space-y-1">
                {addFoodRequirements.map((r) => (
                  <div key={r.barcode}
                    className={`flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg ${
                      r.short ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"
                    }`}>
                    <span className="truncate flex-1">{r.itemName}</span>
                    <span className="tabular-nums-auto shrink-0">{r.required.toLocaleString("en-US")} {r.unit}</span>
                    <span className="tabular-nums-auto shrink-0 text-[10px] opacity-75">
                      {r.short ? `المتوفر ${r.available.toLocaleString("en-US")} فقط` : `متوفر ${r.available.toLocaleString("en-US")}`}
                    </span>
                  </div>
                ))}
              </div>
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
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">تاريخ الحفلة ووقتها</label>
            <input
              type="datetime-local"
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

      {/* Edit People Count Modal */}
      <Modal open={showEditPeopleCount} onClose={() => setShowEditPeopleCount(false)} title="تعديل عدد الأشخاص">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              عدد الأشخاص <span className="text-slate-400 font-normal">— اتركه فارغاً لإزالته</span>
            </label>
            <input
              type="text"
              value={editPeopleCount}
              onChange={(e) => setEditPeopleCount(e.target.value)}
              placeholder="مثال: 300 شخص — رجال ونساء"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowEditPeopleCount(false)}>إلغاء</Button>
            <Button onClick={handleSavePeopleCount} loading={saving}>حفظ</Button>
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
                  = {((concert.price ?? 0) * parseFloat(editHallCostValue || "0") / 100).toLocaleString("en-US")} ريال
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

      {/* إضافة فاتورة مصروف */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="إضافة فاتورة مصروف">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <Select label="نوع المصروف" required value={expenseForm.type}
            onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value })}>
            {expenseTypes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="المبلغ (ريال)" type="number" min={0} step="0.01" required autoFocus
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            <Input label="تاريخ الفاتورة" type="date" required
              value={expenseForm.invoiceDate}
              onChange={(e) => setExpenseForm({ ...expenseForm, invoiceDate: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={expenseForm.vatIncluded}
              onChange={(e) => setExpenseForm({ ...expenseForm, vatIncluded: e.target.checked })} />
            المبلغ شامل الضريبة
            <span className="text-xs text-slate-400">— يُطبَّع عند حساب الربح</span>
          </label>
          <Input label="المورّد (اختياري)" value={expenseForm.supplierName}
            onChange={(e) => setExpenseForm({ ...expenseForm, supplierName: e.target.value })} />
          <Input label="وصف (اختياري)" value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            placeholder="مثال: سيارتان نقل من المستودع للقاعة" />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowAddExpense(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ الفاتورة</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteExpenseTarget}
        onClose={() => setDeleteExpenseTarget(null)}
        onConfirm={handleDeleteExpense}
        title="حذف الفاتورة"
        message={`سيُخصم ${deleteExpenseTarget?.amount.toLocaleString("en-US")} ريال من مصاريف الحفلة. متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />

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
