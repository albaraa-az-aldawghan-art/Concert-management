"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertById, getConcertItems, updateConcert, deleteConcertItem, addConcertItem, getConcertPayments, addConcertPayment, deleteConcertPayment } from "@/lib/firestore/concerts";
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
import { Concert, ConcertItem, MissingItem, AppUser, FoodCategory, ConcertFood, ConcertPayment, PaymentMethod, WarehouseItem } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Calendar, MapPin, Users, Package, AlertTriangle, Pencil, Trash2, ChevronRight, Phone, UserRound, BadgeDollarSign, UtensilsCrossed, Plus, Banknote, CreditCard, Landmark } from "lucide-react";

const METHOD_LABELS: Record<PaymentMethod, string> = { card: "شبكة", cash: "كاش", bank_transfer: "تحويل بنكي" };
const METHOD_COLORS: Record<PaymentMethod, string> = {
  card: "bg-blue-100 text-blue-700",
  cash: "bg-green-100 text-green-700",
  bank_transfer: "bg-purple-100 text-purple-700",
};
function getPaymentDetail(p: ConcertPayment): string {
  if (p.method === "card") return p.cardType === "visa" ? "فيزا" : "مدى";
  if (p.method === "cash") return p.receiverName || "";
  return [p.bankName, p.senderName].filter(Boolean).join(" — ");
}
import Link from "next/link";

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
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteItemTarget, setDeleteItemTarget] = useState<ConcertItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ itemId: "", count: "1" });
  const [saving, setSaving] = useState(false);

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
  const [foodForm, setFoodForm] = useState({ categoryId: "", selectedOption: "", quantity: "", notes: "" });

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const [concertData, itemsData, missingData, foodCats, foodItems, paymentsData, warehouseData] = await Promise.all([
      getConcertById(id),
      getConcertItems(id),
      getMissingItemsByConcert(id),
      getFoodCategories(),
      getConcertFood(id),
      getConcertPayments(id),
      getWarehouseItems(),
    ]);
    setConcert(concertData);
    setItems(itemsData);
    setMissing(missingData);
    setFoodCategories(foodCats);
    setConcertFood(foodItems);
    setPayments(paymentsData);
    setWarehouseItems(warehouseData);

    if (concertData) {
      const supData = await Promise.all(concertData.supervisorIds.map((uid) => getUserById(uid)));
      const empData = await Promise.all(concertData.employeeIds.map((uid) => getUserById(uid)));
      setSupervisors(supData.filter(Boolean) as AppUser[]);
      setEmployees(empData.filter(Boolean) as AppUser[]);
    }
    setLoading(false);
  }

  async function handleAddFood() {
    if (!appUser || !foodForm.categoryId || !foodForm.selectedOption) return;
    const cat = foodCategories.find((c) => c.id === foodForm.categoryId);
    if (!cat) return;
    setSaving(true);
    try {
      await addConcertFood({
        concertId: id,
        categoryId: cat.id,
        categoryName: cat.name,
        selectedOption: foodForm.selectedOption,
        quantity: foodForm.quantity ? parseInt(foodForm.quantity) : null,
        notes: foodForm.notes.trim() || null,
        createdBy: appUser.uid,
      });
      showToast("تم إضافة قسم المأكولات للحفلة");
      setShowFoodForm(false);
      setFoodForm({ categoryId: "", selectedOption: "", quantity: "", notes: "" });
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFood() {
    if (!deleteFoodTarget) return;
    setSaving(true);
    try {
      await deleteConcertFood(deleteFoodTarget.id);
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
    if (!deleteItemTarget) return;
    setSaving(true);
    try {
      await deleteConcertItem(deleteItemTarget.id);
      showToast("تم حذف المادة من الحفلة");
      setDeleteItemTarget(null);
      loadData();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItem() {
    if (!appUser || !concert || !itemForm.itemId) return;
    const item = warehouseItems.find((i) => i.id === itemForm.itemId);
    if (!item) return;
    const count = parseInt(itemForm.count);
    if (!count || count <= 0) return;
    setSaving(true);
    try {
      await addConcertItem({
        concertId: concert.id,
        itemId: item.id,
        itemName: item.name,
        type: item.type,
        count,
        assignedToEmployeeId: null,
        assignedToEmployeeName: null,
      });
      showToast("تمت إضافة المادة");
      setShowItemForm(false);
      setItemForm({ itemId: "", count: "1" });
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
        <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
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
        <Link href="/admin/concerts" className="hover:text-blue-600">الحفلات</Link>
        <ChevronRight size={14} />
        <span className="text-slate-800 font-medium">{concert.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{concert.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={concert.status} />
            {concert.deliveryApproved && <StatusBadge status="confirmed" />}
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Calendar size={15} />
            <span className="text-xs font-medium">التاريخ</span>
          </div>
          <p className="font-semibold text-slate-800">{formatDate(concert.date)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <BadgeDollarSign size={15} />
            <span className="text-xs font-medium">سعر الحفلة</span>
          </div>
          <p className="font-bold text-green-700 text-lg">{concert.price?.toLocaleString("ar-SA")} ريال</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <MapPin size={15} />
            <span className="text-xs font-medium">الموقع</span>
          </div>
          <p className="text-sm text-slate-700 line-clamp-2">{concert.location?.address || "—"}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Users size={15} />
            <span className="text-xs font-medium">الفريق</span>
          </div>
          <p className="font-semibold text-slate-800">{supervisors.length} مشرف · {employees.length} موظف</p>
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
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">إجمالي المدفوع</p>
            <p className="font-bold text-blue-700 text-lg">
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

      {/* Approvals */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-3">حالة القبول</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`p-3 rounded-xl ${concert.deliveryApproved ? "bg-green-50 border border-green-200" : "bg-slate-50 border border-slate-200"}`}>
            <p className="text-sm font-semibold text-slate-700">قبول التسليم</p>
            {concert.deliveryApproved ? (
              <p className="text-xs text-green-600 mt-1">
                ✓ تم القبول بواسطة المشرف — {formatDateTime(concert.deliveryApprovedAt)}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">في انتظار القبول من المشرف</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${concert.returnApproved ? "bg-green-50 border border-green-200" : "bg-slate-50 border border-slate-200"}`}>
            <p className="text-sm font-semibold text-slate-700">قبول الاستلام</p>
            {concert.returnApproved ? (
              <p className="text-xs text-green-600 mt-1">
                ✓ تم القبول بواسطة المشرف — {formatDateTime(concert.returnApprovedAt)}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">في انتظار القبول من المشرف</p>
            )}
          </div>
        </div>
      </Card>

      {/* Supervisors & Employees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-bold text-slate-800 mb-3">المشرفون</h3>
          {supervisors.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مشرفون</p>
          ) : (
            <div className="space-y-2">
              {supervisors.map((s) => (
                <div key={s.uid} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                    {s.name.charAt(0)}
                  </div>
                  <span className="text-sm text-slate-700">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="font-bold text-slate-800 mb-3">الموظفون</h3>
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
          <Button size="sm" onClick={() => { setItemForm({ itemId: "", count: "1" }); setShowItemForm(true); }}>
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
                        <span className="text-sm font-bold text-blue-700">{item.count}</span>
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
                        {item.assignedToEmployeeName && (
                          <p className="text-xs text-slate-400">مسند لـ: {item.assignedToEmployeeName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-700">{item.count}</span>
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
            <Button size="sm" onClick={() => { setFoodForm({ categoryId: "", selectedOption: "", quantity: "", notes: "" }); setShowFoodForm(true); }}>
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
                    ? "border-blue-500 bg-blue-50 text-blue-700"
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
              <input type="text" value={paymentForm.receiverName} onChange={(e) => setPaymentForm({ ...paymentForm, receiverName: e.target.value })} placeholder="اسم الشخص المستلم" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          {paymentForm.method === "bank_transfer" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">اسم البنك</label>
                <input type="text" value={paymentForm.bankName} onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })} placeholder="مثال: الراجحي" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">اسم المحول</label>
                <input type="text" value={paymentForm.senderName} onChange={(e) => setPaymentForm({ ...paymentForm, senderName: e.target.value })} placeholder="اسم المحول" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">المبلغ (ريال)</label>
              <input type="number" min={1} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0.00" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">التاريخ</label>
              <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {paymentForm.amount && concert && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm">
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

      {/* Add Item Modal */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title="إضافة مادة للحفلة">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">المادة</label>
            <select
              value={itemForm.itemId}
              onChange={(e) => setItemForm({ ...itemForm, itemId: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">اختر مادة...</option>
              {warehouseItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.type === "internal" ? "داخلي" : "خارجي"}) — متوفر: {item.availableCount}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">الكمية</label>
            <input
              type="number"
              min={1}
              value={itemForm.count}
              onChange={(e) => setItemForm({ ...itemForm, count: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowItemForm(false)}>إلغاء</Button>
            <Button onClick={handleAddItem} loading={saving} disabled={!itemForm.itemId || !itemForm.count}>إضافة</Button>
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

      {/* Add Food Modal */}
      <Modal open={showFoodForm} onClose={() => setShowFoodForm(false)} title="إضافة قسم مأكولات للحفلة">
        <div className="space-y-4">
          <Select
            label="قسم المأكولات"
            value={foodForm.categoryId}
            onChange={(e) => setFoodForm({ ...foodForm, categoryId: e.target.value, selectedOption: "" })}
            required
            placeholder="اختر قسم مأكولات..."
          >
            {foodCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>

          {foodForm.categoryId && (() => {
            const cat = foodCategories.find((c) => c.id === foodForm.categoryId);
            if (!cat || cat.options.length === 0) return null;
            return (
              <Select
                label="الصنف"
                value={foodForm.selectedOption}
                onChange={(e) => setFoodForm({ ...foodForm, selectedOption: e.target.value })}
                required
                placeholder="اختر صنفاً..."
              >
                {cat.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">الكمية <span className="text-slate-400 font-normal">(اختياري)</span></label>
              <input
                type="number"
                min={1}
                value={foodForm.quantity}
                onChange={(e) => setFoodForm({ ...foodForm, quantity: e.target.value })}
                placeholder="مثال: 50"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">ملاحظات <span className="text-slate-400 font-normal">(اختياري)</span></label>
              <input
                type="text"
                value={foodForm.notes}
                onChange={(e) => setFoodForm({ ...foodForm, notes: e.target.value })}
                placeholder="أي تفاصيل إضافية..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowFoodForm(false)}>إلغاء</Button>
            <Button
              onClick={handleAddFood}
              loading={saving}
              disabled={!foodForm.categoryId || (!foodForm.selectedOption && (foodCategories.find((c) => c.id === foodForm.categoryId)?.options.length ?? 0) > 0)}
            >
              إضافة
            </Button>
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
    </div>
  );
}
