"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Package, Plus, Settings2, RefreshCw, ArrowLeft, ArrowRight, AlertTriangle, ClipboardList, CheckCircle2, Clock3, Trash2, Printer, UserRoundCheck, Tags } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MATERIAL_SECTIONS, MATERIAL_STATES, materialSections, materialRemaining, materialRound, materialSearchKey, type MaterialSection, type MaterialDepartment, type MaterialChoice, type MaterialRequest, type MaterialReceipt } from "@/lib/material-requests";
import { MaterialChoicePicker } from "@/components/ui/material-choice-picker";
import { toLatinDigits } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { downloadBlob } from "@/lib/download-file";

const ENDPOINT = "/api/costs/material-requests";
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const entered = (s: string) => Number(toLatinDigits(s).replace(/[,٬]/g, ""));
type Detail = { request: MaterialRequest; receipts: MaterialReceipt[]; nextReceiptCursor: string | null; items: MaterialChoice[] };
type DraftLine = { item: MaterialChoice; quantity: string; enteredUnit: "stock" | "purchase" };
type ReceiptDraft = { barcode: string; quantity: string; enteredUnit: "stock" | "purchase"; price: string };
type FormKind = "create" | "edit" | "receive" | "invoice" | "cancel" | "void" | "policy" | "classify" | "assign" | null;
const stateClass = (state: string) => state === "completed" ? "bg-emerald-50 text-emerald-700" : state === "cancelled" ? "bg-rose-50 text-rose-700" : state === "awaiting_invoice" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800";
function State({ value }: { value: MaterialRequest["state"] }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${stateClass(value)}`}>{MATERIAL_STATES[value]}</span>; }

export default function MaterialRequestsPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const allowed = (key: string) => appUser?.role === "admin" || feat("costs", key);
  const canRead = !!appUser && can("costs") && ["mat_view", "mat_view_all", "mat_create"].some(allowed);
  const canOpen = canRead || (!!appUser && can("costs") && ["mat_auto", "mat_classify"].some(allowed));
  const [rows, setRows] = useState<MaterialRequest[]>([]);
  const [filters, setFilters] = useState({ q: "", state: "", from: "", to: "" });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const generation = useRef(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const detailGeneration = useRef(0);
  const [kind, setKind] = useState<FormKind>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const operation = useRef("");
  const [choices, setChoices] = useState<MaterialChoice[]>([]);
  const [choicesBusy, setChoicesBusy] = useState(false);
  const [choicesError, setChoicesError] = useState("");
  const [choiceSearch, setChoiceSearch] = useState("");
  const [pick, setPick] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptDraft[]>([]);
  const [receiptTarget, setReceiptTarget] = useState<MaterialReceipt | null>(null);
  const [withInvoice, setWithInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplier, setSupplier] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [suppliersBusy, setSuppliersBusy] = useState(false);
  const [suppliersError, setSuppliersError] = useState("");
  const [policyItem, setPolicyItem] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [minimum, setMinimum] = useState("");
  const [target, setTarget] = useState("");
  const [section, setSection] = useState<MaterialSection>("general");
  const [departments, setDepartments] = useState<MaterialDepartment[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [employeesBusy, setEmployeesBusy] = useState(false);
  const [employeesError, setEmployeesError] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [printRequest, setPrintRequest] = useState<MaterialRequest | null>(null);
  const [printSection, setPrintSection] = useState<MaterialSection>("general");
  const [printing, setPrinting] = useState(false);

  useEffect(() => { const timer = setTimeout(() => setFilters(f => f.q === search.trim() ? f : { ...f, q: search.trim() }), 350); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!canRead) return;
    const timer = setTimeout(() => { setHistory([]); void load(""); }, 0);
    const invalidate = () => { generation.current++; };
    return () => { clearTimeout(timer); invalidate(); };
  }, [canRead, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  async function load(after: string) {
    const version = ++generation.current; setBusy(true); setError("");
    const query = new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, cursor: after }).filter(([,v]) => !!v)));
    try {
      const data = await api.get<{ rows: MaterialRequest[]; nextCursor: string | null }>(`${ENDPOINT}?${query}`);
      if (version !== generation.current) return;
      setRows(data.rows); setNextCursor(data.nextCursor); setCursor(after);
    } catch (e) { if (version === generation.current) { setRows([]); setNextCursor(null); setError(e instanceof Error ? e.message : "تعذر تحميل الطلبات"); } }
    finally { if (version === generation.current) setBusy(false); }
  }
  async function openDetail(id: string, append = false) {
    const version = ++detailGeneration.current; setDetailBusy(true);
    try {
      const query = new URLSearchParams({ id, ...(append && detail?.nextReceiptCursor ? { receiptCursor: detail.nextReceiptCursor } : {}) });
      const data = await api.get<Detail>(`${ENDPOINT}?${query}`);
      if (version === detailGeneration.current) setDetail(append ? { ...data, receipts: [...(detail?.receipts ?? []), ...data.receipts] } : data);
    } catch (e) { showToast(e instanceof Error ? e.message : "تعذر فتح الطلب", "error"); }
    finally { if (version === detailGeneration.current) setDetailBusy(false); }
  }
  async function loadChoices() {
    setChoicesBusy(true); setChoicesError("");
    try { setChoices((await api.get<{ items: MaterialChoice[] }>(`${ENDPOINT}?choices=1`)).items); }
    catch (e) { setChoices([]); setChoicesError(e instanceof Error ? e.message : "تعذر تحميل المواد"); }
    finally { setChoicesBusy(false); }
  }
  async function loadSuppliers() {
    setSuppliersBusy(true); setSuppliersError("");
    try { setSuppliers((await api.get<{ names: string[] }>(`${ENDPOINT}?suppliers=1`)).names); }
    catch (e) { setSuppliersError(e instanceof Error ? e.message : "تعذر تحميل الموردين"); }
    finally { setSuppliersBusy(false); }
  }
  async function loadEmployees() {
    setEmployeesBusy(true); setEmployeesError("");
    try { setEmployees((await api.get<{ employees: { id: string; name: string }[] }>(`${ENDPOINT}?employees=1`)).employees); }
    catch (e) { setEmployees([]); setEmployeesError(e instanceof Error ? e.message : "تعذر تحميل الموظفين"); }
    finally { setEmployeesBusy(false); }
  }
  async function printPdf() {
    if (!printRequest || printing) return;
    setPrinting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const response = await fetch(`${ENDPOINT}/print`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: printRequest.id, section: printSection }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "تعذرت طباعة الطلب"); }
      downloadBlob(await response.blob(), `طلب-مواد-${printRequest.requestDate}.pdf`);
      setPrintRequest(null); showToast("تم تنزيل طلب المواد PDF");
    } catch (e) { showToast(e instanceof Error ? e.message : "تعذرت الطباعة", "error"); }
    finally { setPrinting(false); }
  }
  function openPrint(request: MaterialRequest) { setPrintRequest(request); setPrintSection(request.section ?? "general"); }
  function openForm(next: FormKind, receipt?: MaterialReceipt) {
    operation.current = crypto.randomUUID(); setKind(next); setDate(today()); setInvoiceDate(today()); setNotes(""); setReason(""); setChoiceSearch(""); setPick(""); setSupplier(""); setNewSupplier(""); setInvoiceNumber(""); setWithInvoice(next === "invoice"); setReceiptTarget(receipt ?? null);
    if (next === "create" || next === "edit" || next === "policy" || next === "classify") void loadChoices();
    if ((next === "create" || next === "assign") && allowed("mat_assign")) void loadEmployees();
    if (next === "create") { setDraftLines([]); setSection("general"); setAssignedTo(""); }
    if (next === "assign") setAssignedTo(detail?.request.assignedTo ?? "");
    if (next === "classify") { setPolicyItem(""); setDepartments([]); }
    if (next === "edit" && detail) {
      setSection(detail.request.section ?? "general");
      setDate(detail.request.requestDate); setNotes(detail.request.notes);
      setDraftLines(detail.request.lines.map(l => ({ item: detail.items.find(i => i.id === l.barcode) ?? { id:l.barcode,name:l.name,unit:l.unit,purchaseUnit:l.purchaseUnit,purchaseToIssue:l.purchaseToIssue,balance:l.balanceAtRequest,minimumStock:l.minimumAtRequest,openQuantity:l.requested,pendingInvoiceQuantity:0,autoEnabled:false,targetStock:0 }, quantity: String(l.enteredQuantity), enteredUnit: l.enteredUnit })));
    }
    if (next === "receive" || next === "invoice") {
      if (next === "receive") void loadSuppliers();
      setReceiptLines((receipt ? receipt.lines : detail!.request.lines.filter(l => materialRemaining(l) > 0 && l.cancelled === 0)).map(l => ({ barcode: l.barcode, quantity: receipt ? String((l as MaterialReceipt["lines"][number]).quantity) : "", enteredUnit: "stock", price: "" })));
      if (receipt) { setDate(receipt.receivedDate); setSupplier(receipt.supplierName); }
    }
    if (next === "policy") { setPolicyItem(""); setAutoEnabled(false); setMinimum(""); setTarget(""); }
  }
  function selectPolicy(id: string) {
    setPolicyItem(id); const item = choices.find(i => i.id === id);
    setAutoEnabled(item?.autoEnabled ?? false); setMinimum(String(item?.minimumStock ?? 0)); setTarget(String(item?.targetStock ?? 0));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saveLock.current || !kind) return;
    saveLock.current = true; setSaving(true);
    try {
      let body: Record<string, unknown>;
      if (kind === "create" || kind === "edit") {
        if (!draftLines.length) throw new Error("أضف مادة واحدة على الأقل");
        body = { action: kind, id: detail?.request.id, revision: detail?.request.updatedAt, input: { operationId: operation.current, requestDate: date, notes, section, ...(kind === "create" && allowed("mat_assign") ? { assignedTo: assignedTo || null } : {}), lines: draftLines.map(l => ({ barcode: l.item.id, quantity: entered(l.quantity), enteredUnit: l.enteredUnit })) } };
      } else if (kind === "assign") {
        body = { action: kind, id: detail!.request.id, assignedTo: assignedTo || null, revision: detail!.request.updatedAt };
      } else if (kind === "classify") {
        if (!policyItem) throw new Error("اختر المادة");
        body = { action: kind, barcode: policyItem, sections: departments };
      } else if (kind === "policy") {
        if (!policyItem) throw new Error("اختر المادة");
        body = { action: kind, barcode: policyItem, input: { enabled: autoEnabled, minimumStock: entered(minimum), targetStock: entered(target) } };
      } else if (kind === "cancel" || kind === "void") body = { action: kind, id: detail!.request.id, receiptId: receiptTarget?.id, reason };
      else {
        const selected = receiptLines.filter(l => kind === "invoice" || l.quantity.trim() !== "");
        if (!selected.length) throw new Error("حدد الكميات التي وصلت فعليًا");
        const invoice = (kind === "invoice" || withInvoice) ? { invoiceNumber, invoiceDate, prices: selected.map(l => {
          if (!l.price.trim()) throw new Error("أدخل سعر وحدة الشراء لكل مادة؛ لا يُعامل السعر المفقود كصفر");
          return { barcode: l.barcode, priceBeforeVat: entered(l.price) };
        }) } : undefined;
        body = kind === "invoice" ? { action: kind, id: detail!.request.id, receiptId: receiptTarget!.id, input: invoice }
          : { action: kind, id: detail!.request.id, input: { operationId: operation.current, receivedDate: date, supplierName: supplier === "__new__" ? newSupplier : supplier, notes, lines: selected.map(l => ({ barcode: l.barcode, quantity: entered(l.quantity), enteredUnit: l.enteredUnit })), ...(invoice ? { invoice } : {}) } };
      }
      const result = await api.post<{ id: string }>(ENDPOINT, body);
      setKind(null); showToast(kind === "receive" && !withInvoice ? "حُفظ الوصول بانتظار الفاتورة؛ لم يُضف للمخزون القابل للصرف" : "تم الحفظ بنجاح");
      if (canRead) await load(cursor);
      if (kind === "create") await openDetail(result.id);
      else if (detail && kind !== "policy" && kind !== "classify") {
        if (kind === "assign" && !allowed("mat_view_all") && detail.request.createdBy !== appUser?.uid && assignedTo !== appUser?.uid) setDetail(null);
        else await openDetail(detail.request.id);
      }
      if (kind === "policy" || kind === "classify") setChoices([]);
    } catch (e) { showToast(e instanceof Error ? e.message : "تعذر الحفظ", "error"); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const filteredChoices = choices.filter(i => materialSearchKey(i.name + " " + i.id).includes(materialSearchKey(toLatinDigits(choiceSearch))));
  const receiptSource = receiptTarget?.lines ?? detail?.request.lines ?? [];
  const titles: Record<NonNullable<FormKind>, string> = { create: "طلب مواد جديد", edit: "تعديل الطلب قبل الاستلام", receive: "تسجيل المواد الواصلة", invoice: "تسجيل الفاتورة واعتماد الاستلام", cancel: "إلغاء المتبقي من الطلب", void: "تصحيح دفعة الاستلام", policy: "الطلب التلقائي للمواد", classify: "تصنيف المواد حسب الأقسام", assign: "توجيه الطلب إلى موظف" };
  if (appUser && !canOpen) return <p className="py-12 text-center text-slate-500">لا تملك صلاحية الوصول إلى طلبات المواد.</p>;
  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-[#EEF1F7] p-3 text-[#1C2D50]"><ClipboardList size={25}/></span><div><p className="text-xs text-slate-500">التكاليف / متابعة التوريد</p><h1 className="text-2xl font-extrabold text-[#1C2D50]">طلبات المواد</h1><p className="mt-1 text-sm text-slate-500">من الطلب إلى الوصول والفاتورة، مع تتبع الكميات لكل مادة.</p></div></div>
      <div className="flex flex-wrap gap-2">{allowed("mat_classify") && <Button variant="outline" onClick={() => openForm("classify")}><Tags size={16}/> أقسام المواد</Button>}{allowed("mat_auto") && <Button variant="outline" onClick={() => openForm("policy")}><Settings2 size={16}/> الطلب التلقائي</Button>}{allowed("mat_create") && <Button onClick={() => openForm("create")}><Plus size={16}/> طلب مواد جديد</Button>}</div>
    </div>
    <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-blue-900"><Package size={20} className="mt-1 shrink-0"/><p>الطلب لا يغيّر المخزون. المواد الواصلة دون فاتورة تبقى معلّقة، وتدخل الرصيد القابل للصرف بعد اعتماد الفاتورة. <Link className="font-bold underline" href="/admin/costs/incoming">فتح الوارد</Link></p></div>
    {canRead && <>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
        <Input label="البحث في جميع الطلبات" placeholder="بداية اسم المادة، كلمة منه أو الباركود" type="search" value={search} onChange={e => setSearch(e.target.value)}/>
        <Select label="حالة الطلب" value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}><option value="">كل الحالات</option>{Object.entries(MATERIAL_STATES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select>
        <Input label="من تاريخ الطلب" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}/><Input label="إلى تاريخ الطلب" type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}/>
        <div className="flex items-end gap-2"><Button variant="outline" disabled={busy} onClick={() => void load(cursor)} aria-label="تحديث الطلبات"><RefreshCw size={16}/></Button><Button variant="ghost" onClick={() => { setSearch(""); setFilters({ q:"",state:"",from:"",to:"" }); }}>مسح الفلاتر</Button></div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="font-bold text-[#1C2D50]">متابعة الطلبات</h2><span className="text-xs text-slate-500">{allowed("mat_view_all") ? "جميع الطلبات" : "طلباتي والموجّهة إليّ"} · صفحة {number(history.length + 1)}</span></div>
        {busy ? <p className="p-10 text-center text-slate-500" role="status">جارٍ تحميل الطلبات…</p> : error ? <p className="p-6 text-red-700" role="alert">{error}</p> : !rows.length ? <div className="p-10 text-center text-slate-500"><ClipboardList className="mx-auto mb-3 text-slate-300" size={35}/><p>لا توجد طلبات مطابقة للفلاتر.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["الطلب / المواد","القسم / الموظف","تاريخ الطلب","المصدر","الحالة","آخر وصول","الإجراءات"].map(t => <th key={t} className="px-4 py-3" style={{textAlign:t==="الطلب / المواد"?"right":"center"}}>{t}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} className="hover:bg-slate-50/80">
            <td className="max-w-[300px] px-4 py-4"><p className="break-all text-xs font-bold text-[#1C2D50]" dir="ltr">{row.number}</p><p className="mt-1 truncate text-slate-700">{row.lines.map(l => l.name).join("، ")}</p><p className="mt-1 text-xs text-slate-400">{number(row.lines.length)} مادة</p></td>
            <td className="max-w-[180px] px-3 text-center"><p>{MATERIAL_SECTIONS[row.section ?? "general"]}</p><p className="mt-1 break-words text-xs text-slate-500">{row.assignedToName || "غير موجّه"}</p></td>
            <td className="px-4 text-center tabular-nums" dir="ltr">{row.requestDate}</td><td className="px-4 text-center">{row.source === "automatic" ? "تلقائي" : "يدوي"}</td><td className="px-4 text-center"><State value={row.state}/></td><td className="px-4 text-center tabular-nums" dir="ltr">{row.lastReceivedAt ?? "—"}</td>
            <td className="px-4 text-center"><div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" disabled={detailBusy} onClick={() => void openDetail(row.id)}>فتح الطلب</Button>{allowed("mat_print") && <Button size="sm" variant="outline" onClick={() => openPrint(row)}><Printer size={15}/> PDF</Button>}</div></td>
          </tr>)}</tbody></table></div>}
        <div className="flex justify-between gap-3 border-t border-slate-100 p-4"><Button variant="outline" disabled={busy || !history.length} onClick={() => { const prev=history.at(-1)!; setHistory(h=>h.slice(0,-1)); void load(prev); }}><ArrowRight size={15}/> السابق</Button><span className="self-center text-xs text-slate-500">حتى 20 طلبًا في الصفحة</span><Button variant="outline" disabled={busy || !nextCursor} onClick={() => { setHistory(h=>[...h,cursor]); void load(nextCursor!); }}>التالي <ArrowLeft size={15}/></Button></div>
      </section>
    </>}
    <Modal open={!!detail && !kind} onClose={() => { if (!detailBusy) { detailGeneration.current++; setDetail(null); } }} title="تفاصيل طلب المواد" size="xl" className="sm:max-w-6xl">
      {detail && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><span>القسم: {MATERIAL_SECTIONS[detail.request.section ?? "general"]}</span><span>موجّه إلى: <strong>{detail.request.assignedToName || "غير موجّه"}</strong></span><div className="flex flex-wrap gap-2">{allowed("mat_assign") && <Button size="sm" variant="outline" onClick={() => openForm("assign")}><UserRoundCheck size={15}/> توجيه الطلب</Button>}{allowed("mat_print") && <Button size="sm" variant="outline" onClick={() => openPrint(detail.request)}><Printer size={15}/> طباعة PDF</Button>}</div></div>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="max-w-full break-all text-sm font-bold text-[#1C2D50]" dir="ltr">{detail.request.number}</p><p className="mt-1 text-xs text-slate-500">تاريخ الطلب: <span dir="ltr">{detail.request.requestDate}</span> · {detail.request.source === "automatic" ? "طلب تلقائي" : "طلب يدوي"}</p></div><State value={detail.request.state}/></div>
        {detail.request.notes && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{detail.request.notes}</p>}
        <div className="flex flex-wrap gap-2">{allowed("mat_receive") && detail.request.lines.some(l=>materialRemaining(l)>0 && !l.cancelled) && <Button onClick={()=>openForm("receive")}><Package size={16}/> تسجيل وصول مواد</Button>}{allowed("mat_edit") && detail.request.state === "open" && <Button variant="outline" onClick={()=>openForm("edit")}>تعديل الطلب</Button>}{allowed("mat_cancel") && detail.request.lines.some(l=>materialRemaining(l)>0) && <Button variant="ghost" onClick={()=>openForm("cancel")}>إلغاء المتبقي</Button>}<Button variant="ghost" disabled={detailBusy} onClick={()=>void openDetail(detail.request.id)}><RefreshCw size={14}/> تحديث الرصيد</Button></div>
        <p className="text-xs text-slate-400 sm:hidden">اسحب الجدول أفقيًا لعرض بقية الكميات والأرصدة.</p><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[850px] text-xs"><thead className="bg-slate-50"><tr>{["المادة / الوحدة","المطلوب","وصل فعليًا","بانتظار الفاتورة","معتمد بالمخزون","المتبقي توريده","الملغى","الرصيد الحالي","الحد الأدنى"].map(t=><th key={t} className="px-3 py-3" style={{textAlign:"center"}}>{t}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{detail.request.lines.map(l=>{const item=detail.items.find(i=>i.id===l.barcode);return <tr key={l.barcode}><td className="p-3"><strong>{l.name}</strong><p className="mt-1 text-slate-400" dir="ltr">{l.barcode}</p><p className="mt-1 text-slate-500">{l.unit} · 1 {l.purchaseUnit} = {number(l.purchaseToIssue)} {l.unit}</p><p className="mt-1 text-slate-400">الرصيد عند الطلب: {number(l.balanceAtRequest)}</p></td>{[l.requested,l.received,materialRound(l.received-l.posted),l.posted,materialRemaining(l),l.cancelled].map((v,i)=><td key={i} className={`p-3 text-center tabular-nums ${i===2&&v>0?"font-bold text-amber-700":""}`}>{number(v)}</td>)}<td className={`p-3 text-center font-bold ${(item?.balance??0)<=(item?.minimumStock??0)?"text-red-700":"text-emerald-700"}`}>{item?number(item.balance):"المادة غير متاحة"}</td><td className="p-3 text-center">{item?number(item.minimumStock):"—"}</td></tr>})}</tbody></table></div>
        {detail.request.cancelReason && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">سبب إلغاء المتبقي: {detail.request.cancelReason}</p>}
        <div><h3 className="mb-3 font-bold text-[#1C2D50]">دفعات الوصول والفواتير</h3>{!detail.receipts.length?<p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-400">لم تُسجل دفعات وصول بعد.</p>:<div className="space-y-3">{detail.receipts.map(receipt=><article key={receipt.id} className={`rounded-xl border p-4 ${receipt.state==="void"?"border-slate-200 bg-slate-50":"border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-bold">{receipt.supplierName}</p><p className="mt-1 text-xs text-slate-500">الوصول: <span dir="ltr">{receipt.receivedDate}</span>{receipt.invoiceNumber&&<> · فاتورة {receipt.invoiceNumber} · <span dir="ltr">{receipt.invoiceDate}</span></>}</p></div><span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${receipt.state==="posted"?"bg-emerald-50 text-emerald-700":receipt.state==="void"?"bg-slate-200 text-slate-500":"bg-amber-50 text-amber-800"}`}>{receipt.state==="posted"?"معتمد بالمخزون":receipt.state==="void"?"استلام ملغى":"وصلت · بانتظار الفاتورة"}</span></div><ul className="mt-3 space-y-1 text-sm">{receipt.lines.map(l=><li key={l.barcode} className="flex flex-wrap justify-between gap-2"><span>{l.name}</span><span className="font-semibold">{number(l.quantity)} {l.unit}{allowed("mat_price") && l.priceBeforeVat!==undefined && <span className="mr-2 text-xs font-normal text-slate-500">سعر {l.purchaseUnit}: {number(l.priceBeforeVat)} ريال قبل الضريبة</span>}</span></li>)}</ul>{receipt.notes&&<p className="mt-2 text-xs text-slate-500">{receipt.notes}</p>}<div className="mt-3 flex flex-wrap gap-2">{receipt.state==="awaiting_invoice"&&allowed("mat_invoice")&&<Button variant="outline" size="sm" onClick={()=>openForm("invoice",receipt)}>إضافة الفاتورة واعتماد الكمية</Button>}{receipt.state!=="void"&&allowed("mat_correct")&&<Button variant="ghost" size="sm" onClick={()=>openForm("void",receipt)}>تصحيح / إلغاء الاستلام</Button>}</div></article>)}</div>}{detail.nextReceiptCursor&&<Button className="mt-3" variant="outline" disabled={detailBusy} onClick={()=>void openDetail(detail.request.id,true)}>تحميل دفعات أقدم</Button>}</div>
      </div>}
    </Modal>
    <Modal open={!!kind} onClose={()=>{if(!saving)setKind(null)}} title={kind?titles[kind]:""} size="xl" className="sm:max-w-5xl">
      {kind && <form onSubmit={submit} className="space-y-5">
        {(kind==="create"||kind==="edit")&&<>
          <div className="grid gap-3 sm:grid-cols-2"><Select label="قسم الطلب" value={section} onChange={e => setSection(e.target.value as MaterialSection)}>{Object.entries(MATERIAL_SECTIONS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select><Input label="تاريخ الطلب" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></div>
          <p className="text-xs leading-6 text-slate-500">تظهر جميع المواد الخام لأي قسم تختاره. قسم الطلب يحدد الجهة الطالبة، وتغييره يحافظ على المواد والكميات المدخلة.</p>
          {choicesError?<p role="alert" className="text-sm text-red-700">{choicesError} <Button type="button" variant="ghost" onClick={()=>void loadChoices()}>إعادة المحاولة</Button></p>:<div className="flex items-end gap-2"><div className="min-w-0 flex-1"><MaterialChoicePicker items={choices.filter(i=>!draftLines.some(l=>l.item.id===i.id))} value={pick} onChange={setPick} disabled={choicesBusy}/></div><Button type="button" variant="outline" disabled={!pick||draftLines.length>=30} onClick={()=>{const item=choices.find(i=>i.id===pick);if(!item||draftLines.some(l=>l.item.id===item.id))return;setDraftLines(l=>[...l,{item,quantity:"",enteredUnit:"stock"}]);setPick("")}}><Plus size={15}/> إضافة</Button></div>}
          <div className="space-y-3">{draftLines.map((line,index)=><div key={line.item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-2"><div><strong className="text-sm">{line.item.name}</strong><p className="mt-1 text-xs text-slate-500">الرصيد: {number(line.item.balance)} {line.item.unit} · الحد الأدنى: {number(line.item.minimumStock)}</p></div><Button type="button" variant="ghost" aria-label={`إزالة ${line.item.name}`} onClick={()=>setDraftLines(l=>l.filter((_,i)=>i!==index))}><Trash2 size={15}/></Button></div>{line.item.openQuantity>0&&<p className="my-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle size={13} className="ml-1 inline"/>يوجد طلب مفتوح: {number(line.item.openQuantity)} {line.item.unit}. سيُنشأ طلب إضافي.</p>}{line.item.pendingInvoiceQuantity>0&&<p className="my-2 text-xs text-amber-800">وصلت {number(line.item.pendingInvoiceQuantity)} {line.item.unit} بانتظار الفاتورة.</p>}<div className="mt-3 grid grid-cols-2 gap-3"><Input label={`كمية ${line.item.name}`} type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setDraftLines(ls=>ls.map((l,i)=>i===index?{...l,quantity:e.target.value}:l))}/><Select label={`وحدة طلب ${line.item.name}`} value={line.enteredUnit} onChange={e=>setDraftLines(ls=>ls.map((l,i)=>i===index?{...l,enteredUnit:e.target.value as "stock"|"purchase"}:l))}><option value="stock">{line.item.unit} — المخزون</option><option value="purchase">{line.item.purchaseUnit} — الشراء</option></Select></div><p className="mt-2 text-xs text-slate-500">1 {line.item.purchaseUnit} = {number(line.item.purchaseToIssue)} {line.item.unit} · المطلوب بوحدة المخزون: {number(materialRound((entered(line.quantity)||0)*(line.enteredUnit==="purchase"?line.item.purchaseToIssue:1)))} {line.item.unit}</p></div>)}</div>
          <Textarea label="ملاحظات الطلب" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/>
          {kind === "create" && allowed("mat_assign") && <><Select label="توجيه الطلب إلى موظف" value={assignedTo} disabled={employeesBusy || !!employeesError} onChange={e => setAssignedTo(e.target.value)}><option value="">{employeesBusy ? "جارٍ تحميل الموظفين…" : "غير موجّه — اختر موظفًا"}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select><p className="text-xs text-slate-500">يحتاج الموظف صلاحية عرض طلبات المواد للدخول إليها. لا تتغير صلاحياته بمجرد التوجيه.</p></>}
        </>}
        {kind === "assign" && <><p className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">يرى الطلب منشئه والموظف الموجّه إليه وأصحاب صلاحية عرض جميع الطلبات. لا يمنح التوجيه صلاحية الاستلام أو اعتماد الفواتير.</p><Select label="الموظف الموجّه إليه" value={assignedTo} disabled={employeesBusy || !!employeesError} onChange={e => setAssignedTo(e.target.value)}><option value="">{employeesBusy ? "جارٍ تحميل الموظفين…" : "إلغاء التوجيه"}</option>{detail?.request.assignedTo && !employees.some(e => e.id === detail.request.assignedTo) && <option value={detail.request.assignedTo}>{detail.request.assignedToName} — غير متاح حاليًا</option>}{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></>}
        {(kind === "assign" || kind === "create") && allowed("mat_assign") && employeesError && <p role="alert" className="text-sm text-red-700">{employeesError}<Button type="button" variant="ghost" onClick={() => void loadEmployees()}>إعادة تحميل الموظفين</Button></p>}
        {kind === "classify" && <>
          <p className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">حدد قسمًا أو أكثر لكل مادة لتصفية طباعة الطلبات العامة. تظل جميع المواد متاحة في إنشاء الطلب لأي قسم، ولا تتغير كميات المخزون أو أسعار المواد.</p>
          <Input label="البحث في المواد لتصنيفها" type="search" value={choiceSearch} onChange={e => setChoiceSearch(e.target.value)}/>
          <Select label="المادة المراد تصنيفها" value={policyItem} required disabled={choicesBusy} onChange={e => { setPolicyItem(e.target.value); setDepartments(materialSections(choices.find(i => i.id === e.target.value)?.sections)); }}><option value="">{choicesBusy ? "جارٍ تحميل المواد…" : "اختر المادة"}</option>{filteredChoices.map(item => <option key={item.id} value={item.id}>{item.name} — {materialSections(item.sections).map(s => MATERIAL_SECTIONS[s]).join("، ") || "غير مصنّفة"}</option>)}</Select>
          {choicesError && <p role="alert" className="text-sm text-red-700">{choicesError}<Button type="button" variant="ghost" onClick={() => void loadChoices()}>إعادة تحميل المواد</Button></p>}
          {policyItem && <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-bold">الأقسام التابعة لها المادة</legend>{(["restaurant", "concerts", "contracts"] as MaterialDepartment[]).map(key => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={departments.includes(key)} onChange={e => setDepartments(ds => e.target.checked ? [...ds, key] : ds.filter(s => s !== key))}/>{MATERIAL_SECTIONS[key]}</label>)}</fieldset>}
        </>}
        {(kind==="receive"||kind==="invoice")&&<>
          <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">{kind==="invoice"?"اعتماد الفاتورة يضيف هذه الدفعة للمخزون مرة واحدة ويحتسب تكلفتها.":"سجّل ما وصل فقط. اترك كمية المادة فارغة إن لم تصل. دون فاتورة تبقى الكمية معلّقة وغير قابلة للصرف."}</div>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="تاريخ وصول المواد" type="date" required disabled={kind==="invoice"} value={date} onChange={e=>setDate(e.target.value)}/>{kind==="receive"?<Select label="المورد" required disabled={suppliersBusy} value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">{suppliersBusy?"جارٍ تحميل الموردين…":"اختر المورد"}</option>{suppliers.map(s=><option key={s} value={s}>{s}</option>)}<option value="__new__">إضافة مورد جديد</option></Select>:<div className="self-center rounded-xl bg-slate-50 p-3 text-sm">المورد: {receiptTarget?.supplierName}</div>}</div>
          {supplier==="__new__"&&<Input label="اسم المورد الجديد" required maxLength={150} value={newSupplier} onChange={e=>setNewSupplier(e.target.value)}/>}{suppliersError&&kind==="receive"&&<p role="alert" className="text-sm text-red-700">{suppliersError}<Button type="button" variant="ghost" onClick={()=>void loadSuppliers()}>إعادة المحاولة</Button></p>}
          {kind==="receive"&&allowed("mat_invoice")&&<label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={withInvoice} onChange={e=>setWithInvoice(e.target.checked)}/> الفاتورة متوفرة الآن — تسجيلها واعتماد المخزون مع الوصول</label>}
          {withInvoice&&<div className="grid gap-3 sm:grid-cols-2"><Input label="رقم الفاتورة" required maxLength={150} value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)}/><Input label="تاريخ الفاتورة" type="date" required value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></div>}
          <div className="space-y-3">{receiptLines.map((line,index)=>{const original=receiptSource.find(l=>l.barcode===line.barcode)!;const requestLine=detail!.request.lines.find(l=>l.barcode===line.barcode)!;const quantity=materialRound((entered(line.quantity)||0)*(line.enteredUnit==="purchase"?original.purchaseToIssue:1));return <div key={line.barcode} className="rounded-xl border p-4"><p className="text-sm font-bold">{original.name}</p><p className="my-2 text-xs text-slate-500">متبقي توريده: {number(materialRemaining(requestLine))} {original.unit} · 1 {original.purchaseUnit} = {number(original.purchaseToIssue)} {original.unit}</p><div className={`grid gap-3 ${withInvoice?"sm:grid-cols-3":"sm:grid-cols-2"}`}><Input label={`الواصل من ${original.name}`} type="number" min="0.01" step="0.01" disabled={kind==="invoice"} value={line.quantity} onChange={e=>setReceiptLines(ls=>ls.map((l,i)=>i===index?{...l,quantity:e.target.value}:l))}/><Select label={`وحدة استلام ${original.name}`} disabled={kind==="invoice"} value={line.enteredUnit} onChange={e=>setReceiptLines(ls=>ls.map((l,i)=>i===index?{...l,enteredUnit:e.target.value as "stock"|"purchase"}:l))}><option value="stock">{original.unit}</option><option value="purchase">{original.purchaseUnit} — الشراء</option></Select>{withInvoice&&<Input label={`سعر ${original.purchaseUnit} من ${original.name} قبل الضريبة`} type="number" min="0" step="0.01" required={kind==="invoice"||!!line.quantity} value={line.price} onChange={e=>setReceiptLines(ls=>ls.map((l,i)=>i===index?{...l,price:e.target.value}:l))}/>}</div>{kind==="receive"&&quantity>materialRemaining(requestLine)&&<p className="mt-2 text-xs text-rose-700">زيادة عن المطلوب بمقدار {number(quantity-materialRemaining(requestLine))} {original.unit}{allowed("mat_overreceive")?" — مسموحة بصلاحيتك":" — تحتاج صلاحية استلام الزيادة"}</p>}</div>})}</div>
          {kind==="receive"&&<Textarea label="ملاحظات الوصول" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/>}
        </>}
        {(kind==="cancel"||kind==="void")&&<><p className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{kind==="cancel"?"يُلغى المتبقي الذي لم يصل فقط. الدفعات الواصلة وفواتيرها تبقى محفوظة.":"يُعاد فتح الكمية في الطلب. عكس استلام معتمد ممنوع بعد صرف المادة لحماية المخزون والتكلفة."}</p><Textarea label="السبب" required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></>}
        {kind==="policy"&&<>
          <p className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">عند بلوغ الحد الأدنى يُطلب الفرق إلى الرصيد المستهدف بعد احتساب الطلبات المفتوحة والمواد الواصلة بانتظار الفاتورة. التفعيل قد يُنشئ طلبًا فورًا إن كان الرصيد منخفضًا.</p>
          <Input label="البحث في المواد" type="search" value={choiceSearch} onChange={e=>setChoiceSearch(e.target.value)}/><Select label="المادة" required value={policyItem} disabled={choicesBusy} onChange={e=>selectPolicy(e.target.value)}><option value="">{choicesBusy?"جارٍ تحميل المواد…":"اختر المادة"}</option>{filteredChoices.map(i=><option key={i.id} value={i.id}>{i.name}{i.autoEnabled?" — تلقائي مفعّل":""}</option>)}</Select>
          {choicesError&&<p className="text-sm text-red-700">{choicesError}</p>}
          {policyItem&&<><p className="text-sm text-slate-600">الرصيد الحالي: {number(choices.find(i=>i.id===policyItem)!.balance)} {choices.find(i=>i.id===policyItem)!.unit} · مطلوب ولم يصل: {number(choices.find(i=>i.id===policyItem)!.openQuantity)} · بانتظار الفاتورة: {number(choices.find(i=>i.id===policyItem)!.pendingInvoiceQuantity)}</p><label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 font-bold text-[#1C2D50]"><input type="checkbox" role="switch" checked={autoEnabled} onChange={e=>setAutoEnabled(e.target.checked)}/> تفعيل الطلب التلقائي لهذه المادة</label><div className="grid gap-3 sm:grid-cols-2"><Input label="الحد الأدنى — بوحدة المخزون" type="number" min="0" step="0.01" required value={minimum} onChange={e=>setMinimum(e.target.value)}/><Input label="الرصيد المستهدف — بوحدة المخزون" type="number" min="0" step="0.01" required value={target} onChange={e=>setTarget(e.target.value)}/></div><p className="text-xs text-slate-500">تعطيل الزر يمنع إنشاء طلبات تلقائية جديدة، ولا يلغي الطلبات السابقة.</p></>}
        </>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" disabled={saving} onClick={()=>setKind(null)}>رجوع</Button><Button type="submit" loading={saving} disabled={choicesBusy||((kind==="create"||kind==="assign")&&allowed("mat_assign")&&(employeesBusy||!!employeesError))||(kind==="receive"&&(suppliersBusy||!!suppliersError))}>{kind==="receive"&&!withInvoice?<><Clock3 size={16}/> حفظ الوصول بانتظار الفاتورة</>:kind==="invoice"?<><CheckCircle2 size={16}/> اعتماد الفاتورة وإضافة المخزون</>:"حفظ"}</Button></div>
      </form>}
    </Modal>
    <Modal open={!!printRequest} onClose={() => { if (!printing) setPrintRequest(null); }} title="طباعة طلب المواد PDF">
      {printRequest && <div className="space-y-4"><p className="break-all text-xs text-slate-500" dir="ltr">{printRequest.number}</p><Select label="القسم المطلوب طباعته" value={printSection} disabled={printing} onChange={e => setPrintSection(e.target.value as MaterialSection)}>{Object.entries(MATERIAL_SECTIONS).filter(([key]) => key === "general" || !printRequest.section || printRequest.section === "general" || printRequest.section === key).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select><p className="text-sm leading-6 text-slate-500">يطبع المواد التابعة للقسم المختار من هذا الطلب فقط. عام يطبع جميع مواد الطلب. يشمل بيانات الموظف والتاريخ وكميات الطلب والوصول والمتبقي.</p><Button onClick={() => void printPdf()} loading={printing}><Printer size={16}/> تنزيل PDF</Button></div>}
    </Modal>
  </div>;
}
