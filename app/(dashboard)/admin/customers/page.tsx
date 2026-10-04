"use client";

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

const PAGE_SIZE = 50;
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
  const [frequency, setFrequency] = useState("");
  const [financial, setFinancial] = useState("");
  const [recorder, setRecorder] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("concerts");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();
    return customers.filter((customer) => {
      const searchable = [customer.name, customer.primaryPhone, customer.secondaryPhone, ...customer.concerts.flatMap((concert) => [String(concert.concertNumber ?? ""), concert.venueName ?? ""])].join(" ").toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (frequency === "one" && customer.concertCount !== 1) return false;
      if (frequency === "returning" && customer.concertCount < 2) return false;
      if (financial === "paid" && customer.totalRemaining > 0) return false;
      if (financial === "due" && customer.totalRemaining <= 0) return false;
      if (recorder && customer.firstCreatedByName !== recorder) return false;
      if (period && customer.lastConcertAt) {
        const date = new Date(customer.lastConcertAt);
        if (period === "month" && (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth())) return false;
        if (period === "year" && date.getFullYear() !== now.getFullYear()) return false;
      }
      return !(period && !customer.lastConcertAt);
    });
  }, [customers, search, period, frequency, financial, recorder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageCustomers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = customers.find((customer) => customer.id === selectedId) ?? filtered[0] ?? null;
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

  function exportRows() {
    const headers = ["العميل", "الجوال الأساسي", "الجوال الإضافي", "تاريخ أول تسجيل", "المسجل بواسطة", "مصدر العميل", "عدد الحفلات", "إجمالي القيمة", "المحصل", "المتبقي", "آخر حفلة"];
    const rows = filtered.map((customer) => [customer.name, customer.primaryPhone, customer.secondaryPhone ?? "", formatDate(customer.firstRegisteredAt), customer.firstCreatedByName, customer.source ?? "", customer.concertCount, customer.totalValue, customer.totalCollected, customer.totalRemaining, formatDate(customer.lastConcertAt)]);
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "عملاء-الحفلات.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  if (!allowed) return <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-700">لا تملك صلاحية عرض عملاء الحفلات.</div>;
  if (loading) return <div className="flex min-h-80 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1C2D50] border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-extrabold text-slate-900">عملاء الحفلات</h2><p className="mt-1 text-sm text-slate-500">ملف موحد لكل عميل وحفلاته ودفعاته</p></div>
        {canExport && <Button variant="outline" onClick={exportRows}><Download size={16} /> تصدير إكسل</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="إجمالي العملاء" value={filtered.length.toLocaleString("en-US")} hint="من واقع سجلات الحفلات" icon={<UsersRound size={18} />} />
        <Stat label="عملاء متكررون" value={repeated.toLocaleString("en-US")} hint="لديهم أكثر من حفلة" icon={<UserRound size={18} />} />
        <Stat label="إجمالي الحفلات" value={totalConcerts.toLocaleString("en-US")} hint="لكل العملاء الظاهرين" icon={<CalendarDays size={18} />} />
        <Stat label="إجمالي المتبقي" value={`${money(totalRemaining)} ريال`} hint={`على ${filtered.filter((customer) => customer.totalRemaining > 0).length} عميلاً`} icon={<WalletCards size={18} />} danger={totalRemaining > 0} />
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[2fr_repeat(4,1fr)]">
        <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">بحث</span><div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={15} className="text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="الاسم، الجوال، رقم الحفلة أو المكان..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></label>
        <Filter label="آخر حفلة" value={period} onChange={(value) => { setPeriod(value); setPage(1); }} options={[["", "كل الفترات"], ["month", "هذا الشهر"], ["year", "هذه السنة"]]} />
        <Filter label="عدد الحفلات" value={frequency} onChange={(value) => { setFrequency(value); setPage(1); }} options={[["", "الكل"], ["one", "حفلة واحدة"], ["returning", "عميل متكرر"]]} />
        <Filter label="الحالة المالية" value={financial} onChange={(value) => { setFinancial(value); setPage(1); }} options={[["", "الكل"], ["paid", "مسدد"], ["due", "عليه متبقي"]]} />
        <Filter label="المسجل بواسطة" value={recorder} onChange={(value) => { setRecorder(value); setPage(1); }} options={[["", "كل الموظفين"], ...recorderOptions.map((name) => [name, name])]} />
      </div>

      {customers.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">لا توجد حفلات مسجلة لإنشاء ملفات العملاء منها.</div> : (
        <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h3 className="font-bold text-slate-800">العملاء</h3><span className="text-xs text-slate-400">{filtered.length} نتيجة</span></div>
            <div className="divide-y divide-slate-100">
              {pageCustomers.map((customer) => <button key={customer.id} onClick={() => { setSelectedId(customer.id); setTab("concerts"); }} className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-right transition-colors ${selected?.id === customer.id ? "border-r-4 border-[#1C2D50] bg-slate-100" : "hover:bg-slate-50"}`}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1C2D50] font-bold text-white">{customer.name.trim().charAt(0) || "ع"}</span>
                <span className="min-w-0"><b className="block truncate text-sm text-slate-800">{customer.name}</b><small className="mt-0.5 block text-xs text-slate-500 tabular-nums-auto">{customer.primaryPhone || "بلا رقم"}</small><small className="block text-[11px] text-slate-400">{customer.concertCount} حفلة · آخرها {formatDate(customer.lastConcertAt)}</small></span>
                <span className={`text-[11px] font-bold ${customer.totalRemaining > 0 ? "text-red-600" : "text-emerald-600"}`}>{customer.totalRemaining > 0 ? money(customer.totalRemaining) : "مسدد"}</span>
              </button>)}
              {pageCustomers.length === 0 && <p className="p-8 text-center text-sm text-slate-400">لا توجد نتائج مطابقة</p>}
            </div>
            {totalPages > 1 && <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-xs"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">السابق</button><span className="text-slate-500">{safePage} من {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">التالي</button></div>}
          </section>

          {selected && <CustomerProfile customer={selected} tab={tab} setTab={setTab} canEdit={canEdit} onEdit={() => openEdit(selected)} />}
        </div>
      )}

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
  return <><div className="hidden md:block"><table className="w-full table-fixed text-xs"><thead><tr className="bg-slate-50 text-right text-slate-500"><th className="w-[11%] px-2 py-2">رقم الحفلة</th><th className="w-[24%] px-2 py-2">التاريخ والمكان</th><th className="w-[13%] px-2 py-2">الحالة</th><th className="w-[14%] px-2 py-2">القيمة</th><th className="w-[14%] px-2 py-2">المدفوع</th><th className="w-[14%] px-2 py-2">المتبقي</th><th className="w-[10%] px-2 py-2" /></tr></thead><tbody>{concerts.map((concert) => <ConcertRow key={concert.id} concert={concert} />)}</tbody></table></div><div className="space-y-2 md:hidden">{concerts.map((concert) => <div key={concert.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between"><div><b className="text-sm">حفلة #{concert.concertNumber ?? "—"}</b><p className="mt-1 text-xs text-slate-500">{formatDate(concert.date)} · {concert.venueName || "بلا مكان"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS[concert.status]?.cls ?? "bg-slate-100"}`}>{STATUS[concert.status]?.label ?? concert.status}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span>القيمة<br /><b>{money(concert.price)}</b></span><span>المدفوع<br /><b className="text-emerald-600">{money(concert.paid)}</b></span><span>المتبقي<br /><b className="text-red-600">{money(concert.remaining)}</b></span></div><Link href={`/admin/concerts/${concert.id}`} className="mt-3 block text-left text-xs font-bold text-blue-600">فتح التفاصيل</Link></div>)}</div></>;
}
function ConcertRow({ concert }: { concert: CustomerConcertSummary }) { return <tr className="border-b border-slate-100 text-slate-700"><td className="px-2 py-3 font-bold">#{concert.concertNumber ?? "—"}</td><td className="px-2 py-3"><b className="block">{formatDate(concert.date)}</b><small className="mt-1 block truncate text-slate-400">{concert.venueName || "بلا مكان"}</small></td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS[concert.status]?.cls ?? "bg-slate-100"}`}>{STATUS[concert.status]?.label ?? concert.status}</span></td><td className="px-2 py-3 tabular-nums-auto">{money(concert.price)}</td><td className="px-2 py-3 font-bold text-emerald-600 tabular-nums-auto">{money(concert.paid)}</td><td className={`px-2 py-3 font-bold tabular-nums-auto ${concert.remaining > 0 ? "text-red-600" : "text-slate-400"}`}>{concert.remaining > 0 ? money(concert.remaining) : "—"}</td><td className="px-2 py-3"><Link href={`/admin/concerts/${concert.id}`} className="font-bold text-blue-600">فتح</Link></td></tr>; }

function PaymentsTable({ customer }: { customer: ConcertCustomerSummary }) { return customer.payments.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد دفعات مسجلة</p> : <div className="space-y-2">{customer.payments.map((payment) => <div key={payment.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs sm:grid-cols-5"><span><small className="block text-slate-400">الحفلة</small><b>#{payment.concertNumber ?? "—"}</b></span><span><small className="block text-slate-400">المبلغ</small><b className="text-emerald-600">{money(payment.amount)} ريال</b></span><span><small className="block text-slate-400">الطريقة</small><b>{METHOD[payment.method] ?? payment.method}</b></span><span><small className="block text-slate-400">التاريخ</small><b>{payment.date || formatDate(payment.createdAt)}</b></span><span><small className="block text-slate-400">سجّلها</small><b>{payment.createdByName}</b></span></div>)}</div>; }

