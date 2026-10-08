"use client";

import { LatinInput } from "@/components/ui/latin-input";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, Download, FileSignature, Pencil, Phone, Search, UserRound,
  UsersRound, WalletCards,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  ConcertCustomerSummary, CustomerConcertSummary, getConcertCustomers, saveConcertCustomer,
} from "@/lib/firestore/customers";
import {
  CUSTOMER_CONCERT_PAGE_SIZE, CUSTOMER_PAGE_SIZE, filterConcertCustomers, pageOf,
} from "@/lib/customer-list";
import { auth } from "@/lib/firebase";
import { downloadBlob } from "@/lib/download-file";

const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" })
  : "—";

const STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "غير مؤكدة", cls: "bg-amber-50 text-amber-700" },
  confirmed: { label: "مؤكدة", cls: "bg-emerald-50 text-emerald-700" },
  completed: { label: "مكتملة", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "ملغاة", cls: "bg-red-50 text-red-600" },
};
const METHOD: Record<string, string> = { card: "شبكة", cash: "نقد", bank_transfer: "تحويل بنكي" };

type Tab = "concerts" | "payments" | "notes" | "activity";

export default function CustomersPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const allowed = isAdmin || (appUser?.role === "custom" && can("contracts"));
  const canEdit = isAdmin || feat("contracts", "customers_edit");
  const canExport = isAdmin || feat("contracts", "customers_export");
  const [customers, setCustomers] = useState<ConcertCustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [frequency, setFrequency] = useState("");
  const [financial, setFinancial] = useState("");
  const [recorder, setRecorder] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("concerts");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", primaryPhone: "", secondaryPhone: "", source: "", referralName: "", notes: "" });

  async function load(preferredId?: string) {
    setLoading(true);
    try {
      const data = await getConcertCustomers();
      setCustomers(data);
      const nextId = preferredId && data.some((customer) => customer.id === preferredId)
        ? preferredId : selectedId && data.some((customer) => customer.id === selectedId)
          ? selectedId : data[0]?.id ?? "";
      setSelectedId(nextId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذّر تحميل العملاء", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    getConcertCustomers().then((data) => {
      if (!active) return;
      setCustomers(data);
      setSelectedId((current) => data.some((customer) => customer.id === current) ? current : data[0]?.id ?? "");
    }).catch((error) => {
      if (active) showToast(error instanceof Error ? error.message : "تعذّر تحميل العملاء", "error");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, showToast]);

  const recorderOptions = useMemo(() => [...new Set(customers.map((customer) => customer.firstCreatedByName).filter((name) => name && name !== "—"))].sort((a, b) => a.localeCompare(b, "ar")), [customers]);
  const filtered = useMemo(() => filterConcertCustomers(customers, {
    search,
    period: period as "" | "month" | "year",
    dateFrom,
    dateTo,
    frequency: frequency as "" | "one" | "returning",
    financial: financial as "" | "paid" | "due",
    recorder,
  }), [customers, search, period, dateFrom, dateTo, frequency, financial, recorder]);

  const customerPages = pageOf(filtered, page, CUSTOMER_PAGE_SIZE);
  const safePage = customerPages.page;
  const totalPages = customerPages.totalPages;
  const pageCustomers = customerPages.items;
  const selected = filtered.find((customer) => customer.id === selectedId) ?? pageCustomers[0] ?? null;
  const totalConcerts = filtered.reduce((sum, customer) => sum + customer.concertCount, 0);
  const totalRemaining = filtered.reduce((sum, customer) => sum + customer.totalRemaining, 0);
  const repeated = filtered.filter((customer) => customer.concertCount > 1).length;

  function openEdit(customer: ConcertCustomerSummary) {
    setForm({
      name: customer.name, primaryPhone: customer.primaryPhone, secondaryPhone: customer.secondaryPhone ?? "",
      source: customer.source ?? "", referralName: customer.referralName ?? "", notes: customer.notes ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected || !form.name.trim() || !form.primaryPhone.trim()) {
      showToast("اسم العميل والجوال الأساسي مطلوبان", "error"); return;
    }
    setSaving(true);
    try {
      await saveConcertCustomer({ id: selected.id, ...form });
      setEditing(false);
      showToast("تم حفظ بيانات العميل وربط حفلاته");
      await load(selected.id);
    } catch (error) { showToast(error instanceof Error ? error.message : "تعذّر حفظ العميل", "error"); }
    finally { setSaving(false); }
  }

  async function exportRows() {
    if (!exportIds.length) { showToast("اختر عميلاً واحداً على الأقل", "error"); return; }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");
      return;
    }
    setExporting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت جلسة الدخول — أعد تسجيل الدخول");
      const response = await fetch("/api/customers/export-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: { search, period, dateFrom, dateTo, frequency, financial, recorder },
          customerIds: exportIds,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "تعذّر إنشاء ملف PDF");
      }
      downloadBlob(await response.blob(), `عملاء-الحفلات-${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast(`تم تصدير كشف حساب ${exportIds.length} عميلاً إلى PDF`);
      setExportOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذّر تصدير العملاء", "error");
    } finally {
      setExporting(false);
    }
  }

  if (!allowed) return <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-700">لا تملك صلاحية عرض عملاء الحفلات.</div>;
  if (loading) return <div className="flex min-h-80 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1C2D50] border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-extrabold text-slate-900">عملاء الحفلات</h2><p className="mt-1 text-sm text-slate-500">ملف موحد لكل عميل وحفلاته ودفعاته</p></div>
        {canExport && <Button variant="outline" onClick={() => { setExportIds(filtered.map((customer) => customer.id)); setExportOpen(true); }} disabled={!filtered.length}><Download size={16} /> تصدير كشف حساب PDF</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="إجمالي العملاء" value={filtered.length.toLocaleString("en-US")} hint="من واقع سجلات الحفلات" icon={<UsersRound size={18} />} />
        <Stat label="عملاء متكررون" value={repeated.toLocaleString("en-US")} hint="لديهم أكثر من حفلة" icon={<UserRound size={18} />} />
        <Stat label="إجمالي الحفلات" value={totalConcerts.toLocaleString("en-US")} hint="لكل العملاء الظاهرين" icon={<CalendarDays size={18} />} />
        <Stat label="إجمالي المتبقي" value={`${money(totalRemaining)} ريال`} hint={`على ${filtered.filter((customer) => customer.totalRemaining > 0).length} عميلاً`} icon={<WalletCards size={18} />} danger={totalRemaining > 0} />
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[2fr_repeat(6,1fr)]">
        <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">بحث</span><div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={15} className="text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="الاسم، الجوال، رقم الحفلة أو المكان..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></label>
        <Filter label="آخر حفلة" value={period} onChange={(value) => { setPeriod(value); setPage(1); }} options={[["", "كل الفترات"], ["month", "هذا الشهر"], ["year", "هذه السنة"]]} />
        <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">تاريخ الحفلة من</span><LatinInput type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#1C2D50]" /></label>
        <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">تاريخ الحفلة إلى</span><LatinInput type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#1C2D50]" /></label>
        <Filter label="عدد الحفلات" value={frequency} onChange={(value) => { setFrequency(value); setPage(1); }} options={[["", "الكل"], ["one", "حفلة واحدة"], ["returning", "عميل متكرر"]]} />
        <Filter label="الحالة المالية" value={financial} onChange={(value) => { setFinancial(value); setPage(1); }} options={[["", "الكل"], ["paid", "مسدد"], ["due", "عليه متبقي"]]} />
        <Filter label="المسجل بواسطة" value={recorder} onChange={(value) => { setRecorder(value); setPage(1); }} options={[["", "كل الموظفين"], ...recorderOptions.map((name) => [name, name])]} />
      </div>

      {customers.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">لا توجد حفلات مسجلة لإنشاء ملفات العملاء منها.</div> : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h3 className="font-bold text-slate-800">العملاء</h3><span className="text-xs text-slate-400">{filtered.length} نتيجة</span></div>
            <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:max-h-[620px] lg:divide-y lg:divide-slate-100 lg:overflow-y-auto lg:p-0">
              {pageCustomers.map((customer) => <button key={customer.id} onClick={() => { setSelectedId(customer.id); setTab("concerts"); }} className={`grid w-64 shrink-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 text-right transition-colors lg:w-full lg:rounded-none lg:border-0 ${selected?.id === customer.id ? "border-r-4 border-[#1C2D50] bg-slate-100" : "hover:bg-slate-50"}`}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1C2D50] font-bold text-white">{customer.name.trim().charAt(0) || "ع"}</span>
                <span className="min-w-0"><b className="block truncate text-sm text-slate-800">{customer.name}</b><small className="mt-0.5 block text-xs text-slate-500 tabular-nums-auto">{customer.primaryPhone || "بلا رقم"}</small><small className="block text-[11px] text-slate-400">{customer.concertCount} حفلة · آخرها {formatDate(customer.lastConcertAt)}</small></span>
                <span className={`text-[11px] font-bold ${customer.totalRemaining > 0 ? "text-red-600" : "text-emerald-600"}`}>{customer.totalRemaining > 0 ? money(customer.totalRemaining) : "مسدد"}</span>
              </button>)}
              {pageCustomers.length === 0 && <p className="p-8 text-center text-sm text-slate-400">لا توجد نتائج مطابقة</p>}
            </div>
            {totalPages > 1 && <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-xs"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">السابق</button><span className="text-slate-500">{safePage} من {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">التالي</button></div>}
          </section>

          {selected && <CustomerProfile key={selected.id} customer={selected} tab={tab} setTab={setTab} canEdit={canEdit} onEdit={() => openEdit(selected)} />}
        </div>
      )}

      <Modal open={exportOpen} onClose={() => { if (!exporting) setExportOpen(false); }} title="كشف حساب العملاء إلى PDF" size="lg">
        <p className="mb-3 text-sm text-slate-500">اختر عميلاً أو أكثر. يشمل الكشف جميع حفلاتهم ودفعاتها المطابقة للفلاتر، وليس الصفحة الحالية فقط. نطاق التاريخ حسب تاريخ الحفلة.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExportIds(filtered.map((customer) => customer.id))}>تحديد الكل</Button>
          <Button variant="outline" onClick={() => setExportIds(selected ? [selected.id] : [])}>العميل المفتوح فقط</Button>
          <Button variant="outline" onClick={() => setExportIds([])}>إلغاء التحديد</Button>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {filtered.map((customer) => <label key={customer.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
            <input type="checkbox" checked={exportIds.includes(customer.id)} onChange={(event) => setExportIds((ids) => event.target.checked ? [...ids, customer.id] : ids.filter((id) => id !== customer.id))} />
            <span className="flex-1 text-sm">{customer.name}</span><span className="text-xs text-slate-500" dir="ltr">{customer.primaryPhone}</span>
          </label>)}
        </div>
        <div className="mt-4"><Button onClick={exportRows} loading={exporting} disabled={!exportIds.length}><Download size={16} /> تنزيل كشف الحساب ({exportIds.length} عميل)</Button></div>
      </Modal>
      <Modal open={editing} onClose={() => setEditing(false)} title="تعديل بيانات عميل الحفلات" size="lg">
        <form onSubmit={(event) => { event.preventDefault(); saveEdit(); }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Input label="اسم العميل" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Input label="الجوال الأساسي" required value={form.primaryPhone} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><Input label="الجوال الإضافي" value={form.secondaryPhone} onChange={(event) => setForm({ ...form, secondaryPhone: event.target.value })} /><Select label="مصدر العميل" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option value="">غير محدد</option><option>عميل سابق</option><option>توصية عميل سابق</option><option>موظف</option><option>اتصال مباشر</option><option>إنستغرام</option><option>سناب شات</option><option>واتساب</option><option>أخرى</option></Select></div>
          <Input label="اسم الشخص المُحيل" value={form.referralName} onChange={(event) => setForm({ ...form, referralName: event.target.value })} />
          <Textarea label="ملاحظات العميل" rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>إلغاء</Button><Button type="submit" loading={saving}>حفظ بيانات العميل</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, value, hint, icon, danger = false }: { label: string; value: string; hint: string; icon: React.ReactNode; danger?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{label}</span><span className="rounded-lg bg-slate-100 p-2 text-[#1C2D50]">{icon}</span></div><strong className={`mt-2 block text-xl font-extrabold tabular-nums-auto ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</strong><small className="mt-1 block text-xs text-slate-400">{hint}</small></div>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#1C2D50]">{options.map(([key, text]) => <option key={`${label}-${key}`} value={key}>{text}</option>)}</select></label>;
}

function CustomerProfile({ customer, tab, setTab, canEdit, onEdit }: { customer: ConcertCustomerSummary; tab: Tab; setTab: (tab: Tab) => void; canEdit: boolean; onEdit: () => void }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#1C2D50] text-lg font-bold text-white">{customer.name.charAt(0)}</span><div><h3 className="text-lg font-bold text-slate-900">{customer.name}</h3><p className="text-xs text-slate-500">عميل حفلات منذ {formatDate(customer.firstRegisteredAt)}</p></div></div>{canEdit && <Button variant="outline" size="sm" onClick={onEdit}><Pencil size={14} /> تعديل بيانات العميل</Button>}</div>
    <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-4">
      <Meta icon={<Phone size={14} />} label="الجوال الأساسي" value={customer.primaryPhone || "—"} />
      <Meta icon={<Phone size={14} />} label="الجوال الإضافي" value={customer.secondaryPhone || "—"} />
      <Meta icon={<UserRound size={14} />} label="أول طلب سُجّل بواسطة" value={customer.firstCreatedByName} />
      <Meta icon={<FileSignature size={14} />} label="مصدر العميل" value={customer.source || "غير محدد"} />
    </div>
    <div className="m-5 grid grid-cols-2 overflow-hidden rounded-xl bg-slate-100 xl:grid-cols-4"><ProfileStat label="عدد الحفلات" value={customer.concertCount} /><ProfileStat label="إجمالي القيمة" value={money(customer.totalValue)} /><ProfileStat label="المحصّل" value={money(customer.totalCollected)} green /><ProfileStat label="المتبقي" value={money(customer.totalRemaining)} red={customer.totalRemaining > 0} /></div>
    <div className="flex overflow-x-auto border-y border-slate-100 px-4">{([["concerts", `الحفلات (${customer.concertCount})`], ["payments", `الدفعات (${customer.payments.length})`], ["notes", "ملاحظات العميل"], ["activity", "سجل العميل"]] as [Tab, string][]).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-bold ${tab === key ? "border-[#1C2D50] text-[#1C2D50]" : "border-transparent text-slate-400"}`}>{label}</button>)}</div>
    <div className="p-4 sm:p-5">
      {tab === "concerts" && <ConcertsTable concerts={customer.concerts} />}
      {tab === "payments" && <PaymentsTable customer={customer} />}
      {tab === "notes" && <div className="min-h-32 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{customer.notes || "لا توجد ملاحظات مسجلة لهذا العميل."}{customer.referralName && <p className="mt-3 border-t border-slate-200 pt-3"><b>الشخص المُحيل:</b> {customer.referralName}</p>}</div>}
      {tab === "activity" && <div className="space-y-3">{customer.concerts.slice().reverse().map((concert, index) => <div key={concert.id} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#1C2D50]" /><div><p className="text-sm font-semibold text-slate-700">{index === 0 ? "تسجيل أول طلب" : `إضافة الحفلة #${concert.concertNumber ?? "—"}`}</p><p className="text-xs text-slate-400">{formatDate(concert.createdAt)}{index === 0 ? ` · بواسطة ${customer.firstCreatedByName}` : ""}</p></div></div>)}</div>}
    </div>
  </section>;
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div><span className="flex items-center gap-1.5 text-[11px] text-slate-400">{icon}{label}</span><b className="mt-1.5 block text-sm text-slate-700 tabular-nums-auto">{value}</b></div>; }
function ProfileStat({ label, value, green, red }: { label: string; value: string | number; green?: boolean; red?: boolean }) { return <div className="border-l border-white p-3 last:border-0"><span className="block text-[11px] text-slate-500">{label}</span><b className={`mt-1 block text-lg tabular-nums-auto ${green ? "text-emerald-600" : red ? "text-red-600" : "text-slate-900"}`}>{value}</b></div>; }

function ConcertsTable({ concerts }: { concerts: CustomerConcertSummary[] }) {
  const [page, setPage] = useState(1);
  const pagination = pageOf(concerts, page, CUSTOMER_CONCERT_PAGE_SIZE);
  if (concerts.length === 0) return <p className="py-8 text-center text-sm text-slate-400">لا توجد حفلات مسجلة</p>;
  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[760px] table-fixed text-xs">
        <thead><tr className="bg-slate-50 text-right text-slate-500">
          <th className="w-[11%] px-3 py-3">رقم الحفلة</th>
          <th className="w-[24%] px-3 py-3">التاريخ والمكان</th>
          <th className="w-[13%] px-3 py-3">الحالة</th>
          <th className="w-[14%] px-3 py-3">القيمة</th>
          <th className="w-[14%] px-3 py-3">المدفوع</th>
          <th className="w-[14%] px-3 py-3">المتبقي</th>
          <th className="w-[10%] px-3 py-3" />
        </tr></thead>
        <tbody>{pagination.items.map((concert) => <ConcertRow key={concert.id} concert={concert} />)}</tbody>
      </table>
    </div>
    {pagination.totalPages > 1 && <PageNavigation
      page={pagination.page}
      totalPages={pagination.totalPages}
      onPage={setPage}
      label="صفحة حفلات العميل"
    />}
  </div>;
}
function ConcertRow({ concert }: { concert: CustomerConcertSummary }) { return <tr className="border-b border-slate-100 text-slate-700 last:border-0"><td className="px-3 py-3 font-bold">#{concert.concertNumber ?? "—"}</td><td className="px-3 py-3"><b className="block">{formatDate(concert.date)}</b><small className="mt-1 block truncate text-slate-400">{concert.venueName || "بلا مكان"}</small></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS[concert.status]?.cls ?? "bg-slate-100"}`}>{STATUS[concert.status]?.label ?? concert.status}</span></td><td className="px-3 py-3 tabular-nums-auto">{money(concert.price)}</td><td className="px-3 py-3 font-bold text-emerald-600 tabular-nums-auto">{money(concert.paid)}</td><td className={`px-3 py-3 font-bold tabular-nums-auto ${concert.remaining > 0 ? "text-red-600" : "text-slate-400"}`}>{concert.remaining > 0 ? money(concert.remaining) : "—"}</td><td className="px-3 py-3"><Link href={`/admin/concerts/${concert.id}`} className="font-bold text-blue-600">فتح</Link></td></tr>; }

function PageNavigation({ page, totalPages, onPage, label }: { page: number; totalPages: number; onPage: (page: number) => void; label: string }) {
  return <div className="flex items-center justify-center gap-3 text-xs" aria-label={label}>
    <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">السابق</button>
    <span className="text-slate-500">{page} من {totalPages}</span>
    <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">التالي</button>
  </div>;
}

function PaymentsTable({ customer }: { customer: ConcertCustomerSummary }) { return customer.payments.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد دفعات مسجلة</p> : <div className="space-y-2">{customer.payments.map((payment) => <div key={payment.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs sm:grid-cols-5"><span><small className="block text-slate-400">الحفلة</small><b>#{payment.concertNumber ?? "—"}</b></span><span><small className="block text-slate-400">المبلغ</small><b className="text-emerald-600">{money(payment.amount)} ريال</b></span><span><small className="block text-slate-400">الطريقة</small><b>{METHOD[payment.method] ?? payment.method}</b></span><span><small className="block text-slate-400">التاريخ</small><b>{payment.date || formatDate(payment.createdAt)}</b></span><span><small className="block text-slate-400">سجّلها</small><b>{payment.createdByName}</b></span></div>)}</div>; }

