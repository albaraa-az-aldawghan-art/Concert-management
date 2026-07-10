"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createConcert, addConcertItem, addConcertPaymentRecord } from "@/lib/firestore/concerts";
import { getWarehouseItems } from "@/lib/firestore/warehouse";
import { getUsersByRole } from "@/lib/firestore/users";
import { getVatRate } from "@/lib/firestore/settings";
import { getFoodCategories, addConcertFood } from "@/lib/firestore/food";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { WarehouseItem, AppUser, FoodCategory, PaymentMethod } from "@/types";
import { Timestamp } from "firebase/firestore";
import { Package, UtensilsCrossed, Banknote, CreditCard, Landmark, MapPin, Building2 } from "lucide-react";
import dynamic from "next/dynamic";

const LocationPickerDynamic = dynamic(
  () => import("@/components/map/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 bg-slate-100 rounded-xl animate-pulse" /> }
);

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

interface Location { lat: number; lng: number; address: string; }

interface CheckState { checked: boolean; quantity: string; }

/* ── Checklist checkbox component ── */
function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
        checked ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300 hover:border-[#1C2D50]"
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
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
  const [vatRate, setVatRate] = useState<number>(15);

  const [form, setForm] = useState({
    date: "",
    price: "",
    clientName: "",
    clientPhone: "",
    clientPhone2: "",
    notes: "",
    venueName: "",
    supervisorIds: [] as string[],
    employeeIds: [] as string[],
  });
  const [hallCostType, setHallCostType] = useState<"percentage" | "fixed" | null>(null);
  const [hallCostValue, setHallCostValue] = useState("");
  const [hallCostDate, setHallCostDate] = useState("");
  const [hallCostRecipient, setHallCostRecipient] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [laborCount, setLaborCount] = useState("");
  const [laborPricePerUnit, setLaborPricePerUnit] = useState("");

  /* ── Items checklist ── */
  const [activeItemType, setActiveItemType] = useState<"" | "internal" | "external">("");
  const [itemCheck, setItemCheck] = useState<Record<string, CheckState>>({});

  /* ── Food checklist ── */
  const [foodCategories, setFoodCategories] = useState<FoodCategory[]>([]);
  const [activeFoodCategoryId, setActiveFoodCategoryId] = useState("");
  const [foodCheck, setFoodCheck] = useState<Record<string, CheckState>>({});

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
      const [items, sups, emps, foodCats, vat] = await Promise.all([
        getWarehouseItems(),
        getUsersByRole("supervisor"),
        getUsersByRole("employee"),
        getFoodCategories(),
        getVatRate(),
      ]);
      setWarehouseItems(items);
      setSupervisors(sups);
      setEmployees(emps);
      setFoodCategories(foodCats);
      setVatRate(vat);
    }
    load();
  }, []);

  /* ── Item helpers ── */
  function toggleItem(itemId: string) {
    setItemCheck((prev) => ({
      ...prev,
      [itemId]: { checked: !prev[itemId]?.checked, quantity: prev[itemId]?.quantity ?? "1" },
    }));
  }
  function setItemQty(itemId: string, qty: string) {
    setItemCheck((prev) => ({
      ...prev,
      [itemId]: { checked: prev[itemId]?.checked ?? true, quantity: qty },
    }));
  }
  function buildSelectedItems() {
    return Object.entries(itemCheck)
      .filter(([, s]) => s.checked)
      .map(([itemId, s]) => {
        const item = warehouseItems.find((i) => i.id === itemId)!;
        const count = parseInt(s.quantity) || 1;
        const unitCost = item.type === "external" ? (item.pricePerUnit ?? null) : null;
        const totalCost = unitCost != null ? unitCost * count : null;
        return { itemId, itemName: item.name, type: item.type, count, unitCost, totalCost };
      })
      .filter((i) => i.count > 0);
  }

  /* ── Food helpers ── */
  function foodKey(catId: string, opt: string) { return `${catId}:::${opt}`; }
  function toggleFood(catId: string, opt: string) {
    const k = foodKey(catId, opt);
    setFoodCheck((prev) => ({
      ...prev,
      [k]: { checked: !prev[k]?.checked, quantity: prev[k]?.quantity ?? "" },
    }));
  }
  function setFoodQty(catId: string, opt: string, qty: string) {
    const k = foodKey(catId, opt);
    setFoodCheck((prev) => ({
      ...prev,
      [k]: { checked: prev[k]?.checked ?? true, quantity: qty },
    }));
  }
  function buildSelectedFood() {
    return Object.entries(foodCheck)
      .filter(([, s]) => s.checked)
      .map(([k, s]) => {
        const [catId, opt] = k.split(":::");
        const cat = foodCategories.find((c) => c.id === catId)!;
        return { categoryId: cat.id, categoryName: cat.name, selectedOption: opt || cat.name, quantity: s.quantity, notes: "" };
      });
  }

  /* ── Payment helpers ── */
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

    const selectedItems = buildSelectedItems();
    const selectedFood  = buildSelectedFood();

    if (!form.clientName.trim())      { showToast("يرجى إدخال اسم العميل", "error"); return; }
    if (!form.clientPhone.trim())     { showToast("يرجى إدخال رقم جوال العميل", "error"); return; }
    if (!form.date)                   { showToast("يرجى تحديد تاريخ الحفلة", "error"); return; }
    setSaving(true);
    try {
      const depositTotal = paymentEntries.reduce((sum, p) => sum + p.amount, 0);
      const externalItemsCost = selectedItems
        .filter((i) => i.type === "external" && i.totalCost != null)
        .reduce((sum, i) => sum + (i.totalCost ?? 0), 0) || null;

      const concert = await createConcert({
        name: form.clientName.trim(),
        date: Timestamp.fromDate(new Date(form.date)),
        price: parseFloat(form.price) || 0,
        deposit: depositTotal > 0 ? depositTotal : null,
        location,
        venueName: form.venueName.trim() || null,
        notes: form.notes.trim() || null,
        clientName: form.clientName || null,
        clientPhone: form.clientPhone || null,
        clientPhone2: form.clientPhone2 || null,
        supervisorIds: form.supervisorIds,
        employeeIds: form.employeeIds,
        hallCostType,
        hallCostValue: hallCostValue ? parseFloat(hallCostValue) : null,
        hallCostDate: hallCostDate || null,
        hallCostRecipient: hallCostRecipient.trim() || null,
        transportCost: transportCost ? parseFloat(transportCost) : null,
        laborCount: laborCount ? parseInt(laborCount) : null,
        laborPricePerUnit: laborPricePerUnit ? parseFloat(laborPricePerUnit) : null,
        laborCost: (laborCount && laborPricePerUnit) ? parseInt(laborCount) * parseFloat(laborPricePerUnit) : null,
        vatRate,
        externalItemsCost,
        status: depositTotal > 0 ? "confirmed" : "planned",
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
            unitCost: item.unitCost ?? null,
            totalCost: item.totalCost ?? null,
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

  /* ── Derived counts ── */
  const checkedItemCount = Object.values(itemCheck).filter((s) => s.checked).length;
  const checkedFoodCount = Object.values(foodCheck).filter((s) => s.checked).length;

  /* ── Items split by type ── */
  const internalItems = warehouseItems.filter((i) => i.type === "internal");
  const externalItems = warehouseItems.filter((i) => i.type === "external");
  const activeTypeItems = activeItemType === "internal" ? internalItems : activeItemType === "external" ? externalItems : [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">إنشاء حفلة جديدة</h2>
        <p className="text-sm text-slate-500">أدخل بيانات الحفلة كاملة</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* ── Basic Info ── */}
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
              <Input label="رقم الجوال الأول" type="tel" value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} required placeholder="05xxxxxxxx" maxLength={10} />
              <Input label="رقم الجوال الثاني" type="tel" value={form.clientPhone2}
                onChange={(e) => setForm({ ...form, clientPhone2: e.target.value })} placeholder="05xxxxxxxx (اختياري)" maxLength={10} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                الملاحظات <span className="text-slate-400 font-normal">(اختياري)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أي ملاحظات خاصة بالحفلة..."
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50] resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="تاريخ الحفلة" type="datetime-local" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <div className="flex flex-col gap-1.5">
                <Input label={`السعر الإجمالي مع الضريبة (ريال)`} type="number" min={0} step="0.01" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
                {form.price && parseFloat(form.price) > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <p className="text-xs text-amber-600 font-medium">الضريبة ({vatRate}%)</p>
                      <p className="font-bold text-amber-700 text-sm">
                        {(parseFloat(form.price) * vatRate / (100 + vatRate)).toLocaleString("ar-SA")} ريال
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-xs text-slate-500 font-medium">بدون ضريبة</p>
                      <p className="font-bold text-slate-700 text-sm">
                        {(parseFloat(form.price) / (1 + vatRate / 100)).toLocaleString("ar-SA")} ريال
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hall Cost */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                مبلغ القاعة <span className="text-slate-400 font-normal text-xs">(اختياري)</span>
              </p>
              <div className="flex gap-2">
                {([{ value: null, label: "بدون" }, { value: "percentage", label: "نسبة %" }, { value: "fixed", label: "مبلغ ثابت" }] as { value: "percentage" | "fixed" | null; label: string }[]).map((opt) => (
                  <button key={String(opt.value)} type="button"
                    onClick={() => { setHallCostType(opt.value); setHallCostValue(""); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${hallCostType === opt.value ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {hallCostType && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input type="number" min={0} step="0.01" value={hallCostValue}
                      onChange={(e) => setHallCostValue(e.target.value)}
                      placeholder={hallCostType === "percentage" ? "مثال: 15" : "0.00"}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                    <span className="text-sm text-slate-500 shrink-0">{hallCostType === "percentage" ? "%" : "ريال"}</span>
                    {hallCostType === "percentage" && hallCostValue && form.price && (
                      <span className="text-sm font-bold text-slate-700 shrink-0">
                        = {(parseFloat(form.price) * parseFloat(hallCostValue) / 100).toLocaleString("ar-SA")} ريال
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1">تاريخ تسليم المبلغ</label>
                      <input type="date" value={hallCostDate} onChange={(e) => setHallCostDate(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1">اسم المستلم</label>
                      <input type="text" value={hallCostRecipient} onChange={(e) => setHallCostRecipient(e.target.value)}
                        placeholder="اسم الشخص المستلم"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Transport Cost */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                تكلفة النقل <span className="text-slate-400 font-normal text-xs">(اختياري)</span>
              </p>
              <input type="number" min={0} step="0.01" value={transportCost}
                onChange={(e) => setTransportCost(e.target.value)}
                placeholder="0.00 ريال"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
            </div>

            {/* Labor Cost */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                تكلفة العمالة <span className="text-slate-400 font-normal text-xs">(اختياري)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">عدد العمالة</label>
                  <input type="number" min={0} step="1" value={laborCount}
                    onChange={(e) => setLaborCount(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">سعر الواحد (ريال)</label>
                  <input type="number" min={0} step="0.01" value={laborPricePerUnit}
                    onChange={(e) => setLaborPricePerUnit(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
                </div>
              </div>
              {laborCount && laborPricePerUnit && (
                <div className="flex justify-between px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                  <span className="text-sm font-semibold text-blue-700">الإجمالي</span>
                  <span className="font-bold text-blue-700">
                    {(parseInt(laborCount) * parseFloat(laborPricePerUnit)).toLocaleString("ar-SA")} ريال
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── Venue Name ── */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-[#1C2D50]" />
            <h3 className="font-bold text-slate-700">اسم المكان</h3>
            <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
          </div>
          <input type="text" value={form.venueName}
            onChange={(e) => setForm({ ...form, venueName: e.target.value })}
            placeholder="مثال: قاعة الفريج — حي النرجس"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C2D50]" />
        </Card>

        {/* ── Map ── */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-[#1C2D50]" />
            <h3 className="font-bold text-slate-700">تحديد الموقع</h3>
            <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
          </div>
          <LocationPickerDynamic value={location} onChange={setLocation} />
        </Card>

        {/* ── Payment ── */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Banknote size={16} className="text-emerald-600" />
            طريقة الدفع
            <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
          </h3>
          <div className="flex gap-2 mb-4">
            {(["card", "cash", "bank_transfer"] as PaymentMethod[]).map((m) => (
              <button key={m} type="button" onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors flex items-center justify-center gap-1.5 ${paymentForm.method === m ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                {m === "card" && <CreditCard size={14} />}
                {m === "cash" && <Banknote size={14} />}
                {m === "bank_transfer" && <Landmark size={14} />}
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="space-y-3 mb-3">
            {paymentForm.method === "card" && (
              <Select label="نوع الكارد" value={paymentForm.cardType}
                onChange={(e) => setPaymentForm({ ...paymentForm, cardType: e.target.value as "visa" | "mada" })}>
                <option value="visa">فيزا</option>
                <option value="mada">مدى</option>
              </Select>
            )}
            {paymentForm.method === "cash" && (
              <Input label="اسم المستلم" value={paymentForm.receiverName}
                onChange={(e) => setPaymentForm({ ...paymentForm, receiverName: e.target.value })}
                placeholder="اسم الشخص المستلم للمبلغ" />
            )}
            {paymentForm.method === "bank_transfer" && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="اسم البنك" value={paymentForm.bankName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })} placeholder="مثال: الراجحي" />
                <Input label="اسم المحول" value={paymentForm.senderName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, senderName: e.target.value })} placeholder="اسم المحول" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="المبلغ (ريال)" type="number" min={1} step="0.01" value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0.00" />
              <Input label="التاريخ" type="date" value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={addPaymentEntry}
            disabled={!paymentForm.amount || !paymentForm.date} className="w-full mb-3">
            + إضافة دفعة
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
                  <button type="button" onClick={() => setPaymentEntries((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none">×</button>
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

        {/* ── Items: dropdown → checklist ── */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
            <Package size={16} className="text-indigo-600" />
            المواد
            <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
            {checkedItemCount > 0 && (
              <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {checkedItemCount} مختار
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mb-4">اختر النوع ثم حدد المواد المطلوبة مع الكمية</p>

          {/* Type dropdown */}
          <select
            value={activeItemType}
            onChange={(e) => setActiveItemType(e.target.value as "" | "internal" | "external")}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white mb-4"
          >
            <option value="">— اختر نوع المواد —</option>
            <option value="internal">داخلي ({internalItems.length} مادة)</option>
            <option value="external">خارجي ({externalItems.length} مادة)</option>
          </select>

          {/* Checklist for selected type */}
          {activeItemType && (
            <div className="border border-indigo-100 rounded-xl overflow-hidden mb-4">
              <div className="bg-indigo-50 px-4 py-2.5 border-b border-indigo-100 flex items-center gap-2">
                <Package size={13} className="text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-700">
                  {activeItemType === "internal" ? "مواد داخلية" : "مواد خارجية"}
                </p>
              </div>
              {activeTypeItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">لا توجد مواد في هذا النوع</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {activeTypeItems.map((item) => {
                    const state = itemCheck[item.id];
                    const isChecked = state?.checked ?? false;
                    const qty = parseInt(state?.quantity ?? "1") || 1;
                    const hasPrice = item.type === "external" && item.pricePerUnit != null;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${isChecked ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="pt-0.5">
                          <Checkbox checked={isChecked} onToggle={() => toggleItem(item.id)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}
                            onClick={() => toggleItem(item.id)}
                          >
                            {item.name}
                            <span className="text-xs text-slate-400 mr-1.5">
                              (متوفر: {item.availableCount})
                            </span>
                          </div>
                          {isChecked && hasPrice && (
                            <p className="text-xs text-amber-600 mt-1">
                              {item.pricePerUnit!.toLocaleString("ar-SA")} ريال × {qty} =
                              <span className="font-bold mr-1">{(item.pricePerUnit! * qty).toLocaleString("ar-SA")} ريال</span>
                            </p>
                          )}
                        </div>
                        {isChecked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <label className="text-xs text-slate-400 whitespace-nowrap">الكمية:</label>
                            <input
                              type="number"
                              min={1}
                              max={item.availableCount}
                              value={state?.quantity ?? "1"}
                              onChange={(e) => setItemQty(item.id, e.target.value)}
                              className="w-16 border border-indigo-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Summary of all checked items */}
          {checkedItemCount > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium mb-2">جميع المواد المختارة:</p>
              <div className="flex flex-wrap gap-2">
                {buildSelectedItems().map((item) => (
                  <span key={item.itemId} className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium">
                    {item.itemName} × {item.count}
                    {item.totalCost != null && (
                      <span className="text-amber-600 font-bold mr-1">({item.totalCost.toLocaleString("ar-SA")} ريال)</span>
                    )}
                    <span className="opacity-60 mr-1">({item.type === "internal" ? "داخلي" : "خارجي"})</span>
                  </span>
                ))}
              </div>
              {(() => {
                const extCost = buildSelectedItems()
                  .filter((i) => i.type === "external" && i.totalCost != null)
                  .reduce((sum, i) => sum + (i.totalCost ?? 0), 0);
                if (extCost === 0) return null;
                return (
                  <div className="flex justify-between px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl mt-3">
                    <span className="text-sm font-semibold text-amber-700">إجمالي تكلفة المواد الخارجية</span>
                    <span className="font-bold text-amber-700">{extCost.toLocaleString("ar-SA")} ريال</span>
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

        {/* ── Food: dropdown → checklist ── */}
        {foodCategories.length > 0 && (
          <Card>
            <h3 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
              <UtensilsCrossed size={16} className="text-orange-500" />
              أصناف الأكل
              <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
              {checkedFoodCount > 0 && (
                <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  {checkedFoodCount} مختار
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mb-4">اختر القسم ثم حدد الأصناف المطلوبة مع الكمية</p>

            {/* Category dropdown */}
            <select
              value={activeFoodCategoryId}
              onChange={(e) => setActiveFoodCategoryId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white mb-4"
            >
              <option value="">— اختر قسم الأكل —</option>
              {foodCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Options checklist for selected category */}
            {activeFoodCategoryId && (() => {
              const cat = foodCategories.find((c) => c.id === activeFoodCategoryId);
              if (!cat) return null;
              const options = cat.options.length > 0 ? cat.options : [""];
              return (
                <div className="border border-orange-100 rounded-xl overflow-hidden mb-4">
                  <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100 flex items-center gap-2">
                    <UtensilsCrossed size={13} className="text-orange-500" />
                    <p className="text-sm font-semibold text-orange-700">{cat.name}</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {options.map((opt) => {
                      const k = foodKey(cat.id, opt);
                      const state = foodCheck[k];
                      const isChecked = state?.checked ?? false;
                      const label = opt || cat.name;
                      return (
                        <div key={k}
                          className={`flex items-center gap-3 px-4 py-3 transition-colors ${isChecked ? "bg-orange-50" : "hover:bg-slate-50"}`}>
                          <button type="button" onClick={() => toggleFood(cat.id, opt)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? "bg-orange-500 border-orange-500" : "border-slate-300 hover:border-orange-400"}`}>
                            {isChecked && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          <span className={`flex-1 text-sm cursor-pointer select-none ${isChecked ? "font-semibold text-slate-800" : "text-slate-600"}`}
                            onClick={() => toggleFood(cat.id, opt)}>
                            {label}
                          </span>
                          {isChecked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <label className="text-xs text-slate-400 whitespace-nowrap">الكمية:</label>
                              <input type="number" min={1} value={state?.quantity ?? ""}
                                onChange={(e) => setFoodQty(cat.id, opt, e.target.value)}
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

            {/* All checked food summary */}
            {checkedFoodCount > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 font-medium mb-2">جميع الأصناف المختارة:</p>
                <div className="flex flex-wrap gap-2">
                  {buildSelectedFood().map((f, i) => (
                    <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                      {f.selectedOption !== f.categoryName ? `${f.categoryName} — ${f.selectedOption}` : f.categoryName}
                      {f.quantity && ` × ${f.quantity}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Supervisors ── */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-4">
            المشرفون <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
          </h3>
          {supervisors.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مشرفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {supervisors.map((sup) => (
                <button key={sup.uid} type="button" onClick={() => toggleSupervisor(sup.uid)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.supervisorIds.includes(sup.uid)
                      ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}>
                  <div className="w-7 h-7 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] text-xs font-bold shrink-0">
                    {sup.name.charAt(0)}
                  </div>
                  {sup.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ── Employees ── */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-1">الموظفون</h3>
          <p className="text-xs text-slate-400 mb-4">اختياري — يمكن للمشرف إضافتهم لاحقاً</p>
          {employees.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد موظفون مسجلون</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {employees.map((emp) => (
                <button key={emp.uid} type="button" onClick={() => toggleEmployee(emp.uid)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.employeeIds.includes(emp.uid)
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}>
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold shrink-0">
                    {emp.name.charAt(0)}
                  </div>
                  {emp.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ── Submit ── */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" type="button" onClick={() => router.back()}>إلغاء</Button>
          <Button type="submit" loading={saving} size="lg">إنشاء الحفلة</Button>
        </div>
      </form>
    </div>
  );
}
