"use client";

/* المطبخ: قائمة طلبات الحفلات المرسلة إليه. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getKitchenOrders, confirmKitchenOrder } from "@/lib/firestore/kitchen";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageHeader, PageShell } from "@/components/ui/page";
import { KitchenOrder } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { SearchBox, DateFilterBar, Pagination, emptyDateFilter, DateFilterState, compareDateValues } from "@/components/ui/list-filters";
import { UtensilsCrossed, Printer, CheckCircle2, Clock } from "lucide-react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { matchesKitchenExportOrder, kitchenConcertName, kitchenSelectionNotices, type KitchenExportCandidate, type KitchenExportNotice, type KitchenExportFilters } from "@/lib/kitchen-export";
import { periodBounds } from "@/lib/date-period";
import { auth } from "@/lib/firebase";
import { downloadBlob } from "@/lib/download-file";

const PAGE_SIZE = 10;

export default function KitchenPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const canConfirm = feat("kitchen", "confirm");
  const allowed = can("kitchen");
  const canExport = feat("kitchen", "export");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [checkingExport, setCheckingExport] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [exportCandidates, setExportCandidates] = useState<KitchenExportCandidate[]>([]);
  const [exportCategories, setExportCategories] = useState<string[] | null>(null);
  const [exportReport, setExportReport] = useState<KitchenExportNotice[]>([]);
  const [exportFilters, setExportFilters] = useState<KitchenExportFilters>({date:emptyDateFilter,search:""});
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [statusF, setStatusF] = useState<"" | "sent" | "received">("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, dateF, statusF]);

  useEffect(() => { if(allowed) void load(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      setOrders(await getKitchenOrders());
    } catch {
      showToast("حدث خطأ أثناء التحميل", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(order: KitchenOrder) {
    if (!appUser || !canConfirm) return;
    setConfirmingId(order.id);
    try {
      await confirmKitchenOrder(order.id);
      showToast("تم تأكيد استلام الحفلة");
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  if (appUser && !can("kitchen")) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const pending = orders.filter((o) => o.status === "sent");
  const received = orders.filter((o) => o.status === "received");

  const filtered = orders.filter(
    (o) =>
      (!statusF || o.status === statusF) &&
      matchesKitchenExportOrder(o,{date:dateF,search})
  ).sort((a, b) => compareDateValues(a.concertDate, b.concertDate));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const eligible = filtered.filter(order=>order.status==="received"||order.status==="sent");
  const availableCategories = [...new Set(exportCandidates.filter(candidate=>!candidate.notice).flatMap(candidate=>candidate.categories))];
  const selectionNotices = kitchenSelectionNotices(exportCandidates,exportIds,exportCategories??undefined);
  async function previewExport(ids: string[], filters: KitchenExportFilters) {
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
    const response=await fetch("/api/kitchen/export",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({orderIds:ids,filters,format:"pdf",preview:true})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"تعذر فحص الطلبات");
    return result as {candidates:KitchenExportCandidate[];notices:KitchenExportNotice[];includedCount:number};
  }
  async function openExport() {
    const [from,to]=periodBounds(dateF.mode);
    const filters:KitchenExportFilters={date:dateF.mode==="all"||dateF.mode==="custom"?dateF:{mode:"custom",from,to},search};
    const ids=eligible.map(order=>order.id);
    setExportFilters(filters);setExportIds(ids);setExportCategories(null);setExportCandidates([]);setExportReady(false);setExportOpen(true);setCheckingExport(true);
    try {const result=await previewExport(ids,filters);setExportCandidates(result.candidates);setExportReport(result.notices);setExportReady(true);}
    catch(error){showToast(error instanceof Error?error.message:"تعذر فحص الطلبات","error");}
    finally{setCheckingExport(false);}
  }
  async function exportFile() {
    if(!allowed||!canExport||!exportIds.length||exporting||!exportReady)return;
    setExporting(true);
    try {
      const token=await auth.currentUser?.getIdToken();
      if(!token)throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const filters={...exportFilters,...(exportCategories!==null?{categories:exportCategories}:{})};
      const checked=await previewExport(exportIds,filters);
      setExportCandidates(checked.candidates);setExportReport(checked.notices);
      if(!checked.includedCount)throw new Error("لا توجد أصناف مطابقة؛ راجع التنبيهات واختيار الأقسام");
      const response=await fetch("/api/kitchen/export",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({orderIds:exportIds,filters,format:"pdf"})});
      if(!response.ok){const error=await response.json();if(error.notices)setExportReport(error.notices);throw new Error(error.error||"تعذر التصدير");}
      downloadBlob(await response.blob(),"تجميع-أصناف-المطبخ.pdf");setExportOpen(false);
      const unspecified=Number(response.headers.get("X-Kitchen-Unspecified-Lines")||0);
      const skipped=Number(response.headers.get("X-Kitchen-Skipped-Orders")||0);
      showToast(unspecified ? `تم تنزيل الملف؛ ${unspecified} كمية غير محددة موضحة في ملاحظات الملف` : skipped ? `تم تنزيل الملف مع تجاوز ${skipped} حفلة؛ راجع تنبيهات التصدير` : "تم تصدير أصناف الحفلات المختارة", unspecified||skipped ? "warning" : "success");
    }catch(error){showToast(error instanceof Error?error.message:"تعذر التصدير","error");}finally{setExporting(false);}
  }

  function OrderCard({ order }: { order: KitchenOrder }) {
    const isPending = order.status === "sent";
    return (
      <Card className={isPending ? "border-amber-200" : ""}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-800 truncate">{order.clientName}</p>
            <p className="text-xs text-slate-400 mt-0.5">حفلة #{order.concertNumber}</p>
          </div>
          {isPending ? (
            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
              <Clock size={11} /> بانتظار الاستلام
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold shrink-0">
              <CheckCircle2 size={11} /> تم الاستلام
            </span>
          )}
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">تاريخ الحفلة</span>
            <span className="font-semibold text-slate-800 tabular-nums-auto">{formatDate(order.concertDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">وقت الحفلة</span>
            <span className="font-bold text-[#1C2D50] tabular-nums-auto">{formatTime(order.concertDate)}</span>
          </div>
          {order.venueName && (
            <div className="flex justify-between">
              <span className="text-slate-500">المكان</span>
              <span className="font-semibold text-slate-800">{order.venueName}</span>
            </div>
          )}
          {order.peopleCount && (
            <div className="flex justify-between">
              <span className="text-slate-500">عدد الأشخاص</span>
              <span className="font-semibold text-slate-800">{order.peopleCount}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">أُرسلت في</span>
            <span className="text-slate-600 tabular-nums-auto">{formatDateTime(order.sentAt)}</span>
          </div>
          {order.status === "received" && order.receivedAt && (
            <div className="flex justify-between">
              <span className="text-slate-500">استُلمت في</span>
              <span className="text-green-700 tabular-nums-auto">{formatDateTime(order.receivedAt)}</span>
            </div>
          )}
        </div>

        {order.note && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mt-3 line-clamp-2">
            {order.note}
          </p>
        )}

        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <Link href={`/kitchen/${order.concertId}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Printer size={14} /> عرض وطباعة
            </Button>
          </Link>
          {isPending && canConfirm && (
            <Button
              size="sm"
              variant="success"
              className="flex-1"
              loading={confirmingId === order.id}
              onClick={() => handleConfirm(order)}
            >
              <CheckCircle2 size={14} /> تأكيد الاستلام
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <PageShell>
      <PageHeader title="طلبات المطبخ" icon={UtensilsCrossed}
        description={`${pending.length} بانتظار الاستلام · ${received.length} مستلمة`} />

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="بحث برقم الحفلة، اسم العميل، أو المكان..."
      />

      <DateFilterBar value={dateF} onChange={setDateF} matchedCount={filtered.length} unitLabel="حفلة" />
      {canExport && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">التصدير يشمل المستلمة وبانتظار الاستلام ضمن الفلاتر وعبر جميع الصفحات، ويستبعد الملغاة والفارغة مع بيان السبب.</p>
        <Button variant="outline" disabled={loading||!eligible.length||checkingExport} onClick={openExport}><Download size={16}/> تصدير تجميع الأصناف PDF ({eligible.length})</Button>
      </div>}
      {canExport&&exportReport.length>0&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="mb-2 font-bold">تنبيهات آخر فحص للتصدير ({exportReport.length})</p><ul className="max-h-60 space-y-2 overflow-y-auto">{exportReport.map(notice=><li key={notice.id}><strong>{notice.name}:</strong> {notice.reason}</li>)}</ul></div>}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "", label: "الكل", count: orders.length },
          { key: "sent", label: "بانتظار الاستلام", count: pending.length },
          { key: "received", label: "المستلمة", count: received.length },
        ] as { key: "" | "sent" | "received"; label: string; count: number }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusF(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusF === f.key
                ? "bg-[#1C2D50] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span className="mr-1.5 text-xs opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="جارٍ تحميل طلبات المطبخ..." />
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={UtensilsCrossed} title={orders.length === 0 ? "لم تُرسل أي حفلات للمطبخ بعد" : "لا توجد نتائج مطابقة"}
          description={orders.length > 0 ? "غيّر البحث أو فلتر التاريخ والحالة." : undefined} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
      <Modal open={exportOpen&&canExport} onClose={()=>{if(!exporting&&!checkingExport)setExportOpen(false)}} title="تجميع أصناف الحفلات إلى PDF" size="lg">
        <p className="mb-3 text-sm text-slate-500">اختر الحفلات والأقسام. التقرير بالطول بجدولين متجاورين، مع أسماء الحفلات في الأعلى فقط. يمكن تصدير بانتظار الاستلام دون تأكيدها؛ تُتجاوز الملغاة والفارغة.</p>
        {checkingExport&&<p role="status" className="mb-3 text-sm">جارٍ التحقق من حالة الحفلات والأصناف...</p>}
        {exportReady&&<fieldset className="mb-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-bold">الأقسام المطلوب تصديرها</legend><div className="mb-2 flex gap-2"><Button size="sm" variant="secondary" disabled={exporting} onClick={()=>setExportCategories(null)}>كل الأقسام</Button><Button size="sm" variant="secondary" disabled={exporting} onClick={()=>setExportCategories([])}>إلغاء اختيار الأقسام</Button></div><div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">{availableCategories.map(category=><label key={category} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`قسم ${category}`} disabled={exporting} checked={exportCategories===null||exportCategories.includes(category)} onChange={event=>setExportCategories(current=>event.target.checked?[...(current??availableCategories),category]:(current??availableCategories).filter(value=>value!==category))}/>{category}</label>)}</div></fieldset>}
        <div className="mb-3 flex gap-2"><Button variant="secondary" size="sm" onClick={()=>setExportIds(eligible.map(order=>order.id))} disabled={exporting}>تحديد الكل</Button><Button variant="secondary" size="sm" onClick={()=>setExportIds([])} disabled={exporting}>إلغاء التحديد</Button></div>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
          {eligible.map(order=><label key={order.id} className="flex items-center gap-3 border-b border-slate-100 p-3 text-sm last:border-0"><input type="checkbox" aria-label={`اختيار الحفلة ${order.concertNumber}`} disabled={exporting||checkingExport} checked={exportIds.includes(order.id)} onChange={event=>setExportIds(ids=>event.target.checked?[...ids,order.id]:ids.filter(id=>id!==order.id))}/><span className="min-w-0">{exportCandidates.find(candidate=>candidate.id===order.id)?.name||kitchenConcertName(order)}<small className="block text-slate-500">{formatDate(order.concertDate)} · {order.status==="sent"?"بانتظار الاستلام":"مستلمة"}</small></span></label>)}
        </div>
        {selectionNotices.length>0&&<div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><p className="font-bold">سيتم تجاوز الحفلات التالية:</p>{selectionNotices.map(notice=><p key={notice.id} className="mt-1">{notice.name}: {notice.reason}</p>)}</div>}
        <div className="mt-4 flex justify-end"><Button onClick={exportFile} loading={exporting} disabled={!exportIds.length||!exportReady||exportCategories?.length===0||selectionNotices.length===exportIds.length}><Download size={16}/> تنزيل PDF ({exportIds.length-selectionNotices.length} حفلة)</Button></div>
      </Modal>
    </PageShell>
  );
}
