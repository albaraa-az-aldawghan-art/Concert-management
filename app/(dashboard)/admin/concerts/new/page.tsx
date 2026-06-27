"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createConcert, addConcertItem, addConcertPaymentRecord } from "@/lib/firestore/concerts";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUsersByRole } from "@/lib/firestore/users";
import { getFoodCategories, addConcertFood } from "@/lib/firestore/food";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LocationPicker } from "@/components/map/LocationPicker";
import { WarehouseItem, AppUser, FoodCategory, PaymentMethod } from "@/types";
import { Timestamp } from "firebase/firestore";
import { Plus, Trash2, Package, UtensilsCrossed, CreditCard, Banknote, Landmark } from "lucide-react";
import dynamic from "next/dynamic";

const LocationPickerDynamic = dynamic(
  () => import("@/components/map/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 bg-slate-100 rounded-xl animate-pulse" /> }
);

interface SelectedItem {
  itemId: string;
  itemName: string;
  type: "internal" | "external";
  count: number;
}

interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
  date: string;
  cardType: "visa" | "mada" | null;
  receiverName: string | null;
  bankName: string | null;
  senderName: string | null;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "شبكة",
  cash: "كاش",
  bank_transfer: "تحويل بنكي",
};

function getPaymentDetail(p: PaymentEntry): string {
  if (p.method === "card") return p.cardType === "visa" ? "فيزا" : "مدى";
  if (p.method === "cash") return p.receiverName || "";
  return [p.bankName, p.senderName].filter(Boolean).join(" — ");
}

interface Location {
  lat: number;
  lng: number;
  address: string;
}

export default function NewConcertPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<AppUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);

  const [form, setForm] = useState({
    date: "",
    price: "",
    clientName: "",
    clientPhone: "",
    clientPhone2: "",
    supervisorIds: [] as string[],
    employeeIds: [] as string[],
  });

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [itemForm, setItemForm] = useState({ itemId: "", count: "1" });

  const [foodCategories, setFoodCategories] = useState<FoodCategory[]>([]);
  const [selectedFood, setSelectedFood] = useState<{ categoryId: string; categoryName: string; selectedOption: string; quantity: string; notes: string }[]>([]);
  const [foodForm, setFoodForm] = useState({ categoryId: "", selectedOption: "", quantity: "", notes: "" });

  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    method: "card" as PaymentMethod,
    amount: "",
    date: "",
    cardType: "visa" as "visa" | "mada",
    receiverName: "",
    bankName: "",
    senderName: "",
  });

  useEffect(() => {
    async function load() {
      const [items, sups, emps, foodCats] = await Promise.all([
        getWarehouseItems(),
        getUsersByRole("supervisor"),
        getUsersByRole("employee"),
        getFoodCategories(),
      ]);
      setWarehouseItems(items);
      setSupervisors(sups);
      setEmployees(emps);
      setFoodCategories(foodCats);
    }
    load();
  }, []);

  function addPaymentEntry() {
    if (!paymentForm.amount || !paymentForm.date) return;
    const entry: PaymentEntry = {
      method: paymentForm.method,
      amount: parseFloat(paymentForm.amount),
      date: paymentForm.date,
      cardType: paymentForm.method === "card" ? paymentForm.cardType : null,
      receiverName: paymentForm.method === "cash" ? paymentForm.receiverName.trim() || null : null,
      bankName: paymentForm.method === "bank_transfer" ? paymentForm.bankName.trim() || null : null,
      senderName: paymentForm.method === "bank_transfer" ? paymentForm.senderName.trim() || null : null,
    };
    setPaymentEntries((prev) => [...prev, entry]);
    setPaymentForm({ method: "card", amount: "", date: "", cardType: "visa", receiverName: "", bankName: "", senderName: "" });
  }

  function addFoodItem() {
    const cat = foodCategories.find((c) => c.id === foodForm.categoryId);
    if (!cat) return;
    if (cat.options.length > 0 && !foodForm.selectedOption) return;
    setSelectedFood((prev) => [...prev, {
      categoryId: cat.id,
      categoryName: cat.name,
      selectedOption: foodForm.selectedOption || cat.name,
      quantity: foodForm.quantity,
      notes: foodForm.notes,
    }]);
    setFoodForm({ categoryId: "", selectedOption: "", quantity: "", notes: "" });
  }

  function removeFoodItem(index: number) {
    setSelectedFood((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    if (!itemForm.itemId || !itemForm.count) return;
    const item = warehouseItems.find((i) => i.id === itemForm.itemId);
    if (!item) return;
    const count = parseInt(itemForm.count);
    if (count <= 0) return;

    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.itemId === itemForm.itemId);
      if (existing) {
        return prev.map((i) =>
          i.itemId === itemForm.itemId ? { ...i, count: i.count + count } : i
        );
      }
      return [...prev, { itemId: item.id, itemName: item.name, type: item.type, count }];
    });
    setItemForm({ itemId: "", count: "1" });
  }

  function removeItem(itemId: string) {
    setSelectedItems((prev) => prev.filter((i) => i.itemId !== itemId));
  }

  function toggleSupervisor(uid: string) {
    setForm((prev) => ({
      ...prev,
      supervisorIds: prev.supervisorIds.includes(uid)
        ? prev.supervisorIds.filter((id) => id !== uid)
        : [...prev.supervisorIds, uid],
    }));
  }

  function toggleEmployee(uid: string) {
    setForm((prev) => ({
      ...prev,
      employeeIds: prev.employeeIds.includes(uid)
        ? prev.employeeIds.filter((id) => id !== uid)
        : [...prev.employeeIds, uid],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;

    if (!form.clientName.trim()) { showToast("يرجى إدخال اسم العميل", "error"); return; }
    if (!form.clientPhone.trim()) { showToast("يرجى إدخال رقم جوال العميل", "error"); return; }
    if (form.supervisorIds.length === 0) { showToast("يرجى اختيار مشرف واحد على الأقل", "error"); return; }
    if (selectedItems.length === 0) { showToast("يرجى إضافة مادة واحدة على الأقل", "error"); return; }
    if (paymentEntries.length === 0) { showToast("يرجى إضافة دفعة واحدة على الأقل", "error"); return; }

    setSaving(true);
    try {
      const depositTotal = paymentEntries.reduce((sum, p) => sum + p.amount, 0);

      const concert = await createConcert({
        name: form.clientName.trim(),
        date: Timestamp.fromDate(new Date(form.date)),
        price: parseFloat(form.price),
        deposit: depositTotal > 0 ? depositTotal : null,
        location,
        clientName: form.clientName || null,
        clientPhone: form.clientPhone || null,
        clientPhone2: form.clientPhone2 || null,
        supervisorIds: form.supervisorIds,
        employeeIds: form.employeeIds,
        status: "planned",
        createdBy: appUser.uid,
      });

      await Promise.all([
        ...selectedItems.map((item) =>
          addConcertItem({
            concertId: concert.id,
            itemId: item.itemId,
            itemName: item.itemName,
            type: item.type,
            count: item.count,
            assignedToEmployeeId: null,
            assignedToEmployeeName: null,
          })
        ),
        ...selectedFood.map((f) =>
          addConcertFood({
            concertId: concert.id,
            categoryId: f.categoryId,
            categoryName: f.categoryName,
            selectedOption: f.selectedOption,
            quantity: f.quantity ? parseInt(f.quantity) : null,
            notes: f.notes.trim() || null,
            createdBy: appUser.uid,
          })
        ),
        ...paymentEntries.map((p) =>
          addConcertPaymentRecord({
            concertId: concert.id,
            method: p.method,
            amount: p.amount,
            date: p.date,
            cardType: p.cardType,
            receiverName: p.receiverName,
            bankName: p.bankName,
            senderName: p.senderName,
            createdBy: appUser.uid,
          })
        ),
      ]);

      showToast("تم إنشاء الحفلة بنجاح");
      router.push("/admin/concerts");
    } catch {
      showToast("حدث خطأ أثناء إنشاء الحفلة", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">إنشاء حفلة جديدة</h2>
        <p className="text-sm text-slate-500">أدخل بيانات الحفلة كاملة</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Info */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4">معلومات العميل</h3>
          <div className="space-y-4">
            <Input
              label="اسم العميل"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              required
              placeholder="اسم العميل"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="رقم الجوال الأول"
                type="tel"
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                required
                placeholder="05xxxxxxxx"
              />
              <Input
                label="رقم الجوال الثاني"
                type="tel"
                value={form.clientPhone2}
                onChange={(e) => setForm({ ...form, clientPhone2: e.target.value })}
                placeholder="05xxxxxxxx (اختياري)"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="تاريخ الحفلة"
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              <Input
                label="سعر الحفلة (ريال)"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>
          </div>
        </Card>

        {/* Map */}
        <Card>
          <LocationPickerDynamic value={location} onChange={setLocation} />
        </Card>

        {/* Payment Methods */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Banknote size={16} className="text-emerald-600" />
            طريقة الدفع
            <span className="text-red-500">*</span>
            <span className="text-slate-400 text-xs font-normal">(دفعة واحدة على الأقل)</span>
          </h3>

          {/* Method Tabs */}
          <div className="flex gap-2 mb-4">
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

          {/* Method-specific fields */}
          <div className="space-y-3 mb-3">
            {paymentForm.method === "card" && (
              <Select
                label="نوع الكارد"
                value={paymentForm.cardType}
                onChange={(e) => setPaymentForm({ ...paymentForm, cardType: e.target.value as "visa" | "mada" })}
              >
                <option value="visa">فيزا</option>
                <option value="mada">مدى</option>
              </Select>
            )}
            {paymentForm.method === "cash" && (
              <Input
                label="اسم المستلم"
                value={paymentForm.receiverName}
                onChange={(e) => setPaymentForm({ ...paymentForm, receiverName: e.target.value })}
                placeholder="اسم الشخص المستلم للمبلغ"
              />
            )}
            {paymentForm.method === "bank_transfer" && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="اسم البنك"
                  value={paymentForm.bankName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })}
                  placeholder="مثال: الراجحي"
                />
                <Input
                  label="اسم المحول"
                  value={paymentForm.senderName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, senderName: e.target.value })}
                  placeholder="اسم المحول"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="المبلغ (ريال)"
                type="number"
                min={1}
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                placeholder="0.00"
              />
              <Input
                label="التاريخ"
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
              />
            </div>
          </div>

          <Button type="button" variant="outline" onClick={addPaymentEntry} disabled={!paymentForm.amount || !paymentForm.date} className="w-full mb-3">
            <Plus size={16} /> إضافة دفعة
          </Button>

          {paymentEntries.length > 0 && (
            <div className="space-y-2">
              {paymentEntries.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{METHOD_LABELS[p.method]}</span>
                      <span className="font-bold text-slate-800 text-sm">{p.amount.toLocaleString("ar-SA")} ريال</span>
                    </div>
                    <p className="text-xs text-slate-400">{p.date}{getPaymentDetail(p) ? ` — ${getPaymentDetail(p)}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => setPaymentEntries((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between px-1 pt-1 text-sm">
                <span className="text-slate-500">إجمالي الدفعات</span>
                <span className="font-bold text-emerald-700">{paymentEntries.reduce((s, p) => s + p.amount, 0).toLocaleString("ar-SA")} ريال</span>
              </div>
              {form.price && parseFloat(form.price) > 0 && (
                <div className="flex justify-between px-1 text-sm">
                  <span className="text-slate-500">المتبقي</span>
                  <span className="font-bold text-orange-700">
                    {(parseFloat(form.price) - paymentEntries.reduce((s, p) => s + p.amount, 0)).toLocaleString("ar-SA")} ريال
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4">المواد</h3>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <Select
                value={itemForm.itemId}
                onChange={(e) => setItemForm({ ...itemForm, itemId: e.target.value })}
                placeholder="اختر مادة..."
              >
                {warehouseItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.type === "internal" ? "داخلي" : "خارجي"}) — متوفر: {item.availableCount}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              type="number"
              min={1}
              value={itemForm.count}
              onChange={(e) => setItemForm({ ...itemForm, count: e.target.value })}
              className="w-20"
            />
            <Button type="button" onClick={addItem} variant="outline">
              <Plus size={16} />
            </Button>
          </div>

          {selectedItems.length === 0 ? (
            <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl">
              <Package size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">لم يتم إضافة مواد بعد</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.itemId}
                  className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-800">{item.itemName}</span>
                    <span className="text-xs text-slate-400 mr-2">
                      ({item.type === "internal" ? "داخلي" : "خارجي"})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-blue-700">{item.count}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.itemId)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Food Items */}
        {foodCategories.length > 0 && (
          <Card>
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <UtensilsCrossed size={16} className="text-orange-500" />
              أصناف الأكل
              <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
            </h3>

            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex-1 min-w-[140px]">
                <Select
                  value={foodForm.categoryId}
                  onChange={(e) => setFoodForm({ ...foodForm, categoryId: e.target.value, selectedOption: "" })}
                  placeholder="اختر قسم مأكولات..."
                >
                  {foodCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
              {foodForm.categoryId && (() => {
                const cat = foodCategories.find((c) => c.id === foodForm.categoryId);
                if (!cat || cat.options.length === 0) return null;
                return (
                  <div className="flex-1 min-w-[140px]">
                    <Select
                      value={foodForm.selectedOption}
                      onChange={(e) => setFoodForm({ ...foodForm, selectedOption: e.target.value })}
                      placeholder="اختر صنفاً..."
                    >
                      {cat.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </Select>
                  </div>
                );
              })()}
              <input
                type="number"
                min={1}
                value={foodForm.quantity}
                onChange={(e) => setFoodForm({ ...foodForm, quantity: e.target.value })}
                placeholder="الكمية"
                className="w-24 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button type="button" onClick={addFoodItem} variant="outline" disabled={!foodForm.categoryId}>
                <Plus size={16} />
              </Button>
            </div>

            {selectedFood.length === 0 ? (
              <div className="text-center py-4 text-slate-400 bg-slate-50 rounded-xl">
                <UtensilsCrossed size={24} className="mx-auto mb-1.5 opacity-40" />
                <p className="text-sm">لم يتم إضافة أصناف بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedFood.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{f.categoryName}</span>
                      {f.selectedOption !== f.categoryName && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium mr-2">{f.selectedOption}</span>
                      )}
                      {f.quantity && <span className="text-xs text-slate-400 mr-2">الكمية: {f.quantity}</span>}
                    </div>
                    <button type="button" onClick={() => removeFoodItem(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Supervisors */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4">
            المشرفون
            <span className="text-red-500 mr-1">*</span>
          </h3>
          {supervisors.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مشرفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {supervisors.map((sup) => (
                <button
                  key={sup.uid}
                  type="button"
                  onClick={() => toggleSupervisor(sup.uid)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.supervisorIds.includes(sup.uid)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                    {sup.name.charAt(0)}
                  </div>
                  {sup.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Employees (Optional) */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-1">الموظفون</h3>
          <p className="text-xs text-slate-400 mb-4">اختياري — يمكن للمشرف إضافتهم لاحقاً</p>
          {employees.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد موظفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {employees.map((emp) => (
                <button
                  key={emp.uid}
                  type="button"
                  onClick={() => toggleEmployee(emp.uid)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.employeeIds.includes(emp.uid)
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold shrink-0">
                    {emp.name.charAt(0)}
                  </div>
                  {emp.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" type="button" onClick={() => router.back()}>
            إلغاء
          </Button>
          <Button type="submit" loading={saving} size="lg">
            إنشاء الحفلة
          </Button>
        </div>
      </form>
    </div>
  );
}
