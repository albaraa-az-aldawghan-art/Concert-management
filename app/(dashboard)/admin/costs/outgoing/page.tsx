"use client";

/* المنصرف: صرف الخامات على الأقسام والحفلات، وتسوية المرتجع والتالف. */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCostOutgoing, deleteCostOutgoing, settleCostOutgoing, getCostSettings, reassignOutgoing } from "@/lib/firestore/costs";
import { getConcerts } from "@/lib/firestore/concerts";
import { getContracts } from "@/lib/firestore/contracts";
import { getPendingRequests, approveRequest, rejectRequest } from "@/lib/firestore/dispense-requests";
import { useToast } from "@/components/ui/toast";
import { Actor } from "@/components/ui/actor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { SearchBox, DateFilterBar, Pagination, matchesDate, emptyDateFilter, DateFilterState } from "@/components/ui/list-filters";
import { formatDate } from "@/lib/utils";
import { normalizeStatus, statusColor, statusLabel } from "@/lib/concert-status";
import { CostOutgoing, CostSettings, Concert, Contract, OutgoingChannel, OUTGOING_CHANNELS, DispenseRequest } from "@/types";
import { PackageMinus, Trash2, CheckCircle2, Music, AlertTriangle, Undo2 } from "lucide-react";

const PAGE_SIZE = 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function CostsOutgoingPage() {
  const { appUser, can, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const pageAllowed = isAdmin || (appUser?.role === "custom" && can("costs"));
  const canView = isAdmin || feat("costs", "out_view");
  const canSettle = isAdmin || feat("costs", "out_settle");
  const canDelete = isAdmin || feat("costs", "out_delete");
  const canReassign = isAdmin || feat("costs", "out_reassign");
  const canSeeReq = isAdmin || feat("costs", "req_view") || feat("costs", "req_approve");
  const canApproveReq = isAdmin || feat("costs", "req_approve");
  const fo = {
    cost:  isAdmin || feat("costs", "of_cost"),
    dest:  isAdmin || feat("costs", "of_dest"),
    date:  isAdmin || feat("costs", "of_date"),
    actor: isAdmin || feat("costs", "of_actor"),
  };

  const [entries, setEntries] = useState<CostOutgoing[]>([]);
  const [settings, setSettings] = useState<CostSettings>({ units: [], departments: [] });
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState<OutgoingChannel | "" | "none">("");
  const [showBreakdown, setShowBreakdown] = useState(true);
  /* إسناد العمليات القديمة: اختيار متعدد ثم وجهة واحدة للدفعة */
  const [showAssign, setShowAssign] = useState(false);
  const [assignPicked, setAssignPicked] = useState<Set<string>>(new Set());
  const [assignChannel, setAssignChannel] = useState<OutgoingChannel | null>(null);
  const [assignConcert, setAssignConcert] = useState<Concert | null>(null);
  const [assignContract, setAssignContract] = useState<Contract | null>(null);
  const [dateF, setDateF] = useState<DateFilterState>(emptyDateFilter);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CostOutgoing | null>(null);
  const [settleTarget, setSettleTarget] = useState<CostOutgoing | null>(null);
  const [settleForm, setSettleForm] = useState({ returned: "", damaged: "", reason: "", date: "" });
  /* طلبات صرف الحفلات المعلّقة — تُقرّ من هنا فتُصرف على حفلتها */
  const [requests, setRequests] = useState<DispenseRequest[]>([]);
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  /* أقسام التعاقدات تطالب باختيار عقد كما تطالب أقسام الحفلات بحفلة */
  const [contracts, setContracts] = useState<Contract[]>([]);

  useEffect(() => { setPage(1); }, [search, dateF, deptFilter, channelFilter]);
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [e, s, c, ct, reqs] = await Promise.all([
      getCostOutgoing(), getCostSettings(), getConcerts(),
      getContracts().catch(() => [] as Contract[]),
      getPendingRequests().catch(() => [] as DispenseRequest[]),
    ]);
    setRequests(reqs);
    setContracts(ct);
    setEntries(e);
    setSettings(s);
    setConcerts(c);
    setLoading(false);
  }

  async function handleRequest(id: string, action: "approve" | "reject") {
    setReqBusy(id);
    try {
      if (action === "approve") {
        await approveRequest(id, settings.departments[0]?.name ?? "المطبخ");
        showToast("أُقرّ الطلب وصُرفت أصنافه على الحفلة");
      } else {
        await rejectRequest(id, "");
        showToast("رُفض الطلب ولم يُصرف شيء");
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setReqBusy(null);
    }
  }

  function openAssign() {
    setAssignPicked(new Set(unassigned.map((e) => e.id)));
    setAssignChannel(null);
    setAssignConcert(null);
    setAssignContract(null);
    setShowAssign(true);
  }

  async function handleAssign() {
    if (!assignChannel) { showToast("اختر الوجهة", "error"); return; }
    if (assignPicked.size === 0) { showToast("اختر عملية واحدة على الأقل", "error"); return; }
    if (assignChannel === "concerts" && !assignConcert) { showToast("اختر الحفلة", "error"); return; }
    if (assignChannel === "contracts" && !assignContract) { showToast("اختر العقد", "error"); return; }
    setSaving(true);
    try {
      /* واحدة تلو الأخرى: كل عملية تُتحقَّق على الخادم بمفردها،
         فلا تمرّ دفعة كاملة بفحص واحد */
      for (const id of assignPicked) {
        await reassignOutgoing(id, {
          channel: assignChannel,
          concertId: assignChannel === "concerts" ? assignConcert?.id ?? null : null,
          concertName: assignChannel === "concerts" ? assignConcert?.name ?? null : null,
          clientName: assignChannel === "concerts" ? assignConcert?.clientName ?? null : null,
          contractId: assignChannel === "contracts" ? assignContract?.id ?? null : null,
          contractName: assignChannel === "contracts" ? assignContract?.name ?? null : null,
        });
      }
      showToast(`أُسندت ${assignPicked.size} عملية`);
      setShowAssign(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  function openSettle(e: CostOutgoing) {
    setSettleTarget(e);
    setSettleForm({ returned: "", damaged: "", reason: "", date: new Date().toISOString().slice(0, 10) });
  }

  async function handleSettle() {
    if (!appUser || !settleTarget) return;
    const returned = parseFloat(settleForm.returned) || 0;
    const damaged = parseFloat(settleForm.damaged) || 0;
    if (returned + damaged <= 0) { showToast("أدخل كمية مرتجعة أو تالفة", "error"); return; }
    if (damaged > 0 && !settleForm.reason.trim()) { showToast("اكتب سبب التلف", "error"); return; }
    setSaving(true);
    try {
      await settleCostOutgoing(settleTarget, {
        returnedQty: returned,
        damagedQty: damaged,
        reason: settleForm.reason.trim(),
        damageDate: settleForm.date,
        createdBy: appUser.uid,
      });
      showToast(damaged > 0 ? "سُجّل المرتجع والتالف" : "رجعت الكمية للمخزون");
      setSettleTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCostOutgoing(deleteTarget);
      showToast("تم حذف العملية");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  if (appUser && !pageAllowed) {
    return <p className="text-center text-slate-400 py-12">غير مصرح لك بالوصول لهذه الصفحة</p>;
  }

  const q = search.trim();
  const filtered = entries
    .filter((e) => matchesDate(e.dispenseDate ?? e.createdAt, dateF))
    .filter((e) => !deptFilter || e.departmentName === deptFilter)
    .filter((e) =>
      !channelFilter ? true : channelFilter === "none" ? !e.channel : e.channel === channelFilter
    )
    .filter((e) => !q || e.itemName.includes(q) || e.itemBarcode.includes(q) || (e.concertName ?? "").includes(q) || (e.clientName ?? "").includes(q) || (e.manualConcertName ?? "").includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* ══ التقسيم المفصَّل ══
     يُحسب من filtered لا من entries، فيتبع فلاتر التاريخ والبحث والقسم.
     ومجموع القنوات الأربع + ما بلا وجهة = المجموع الكلي بالضبط. */
  const grandTotal = r2(filtered.reduce((s, e) => s + (e.totalCost ?? 0), 0));

  const byChannel = OUTGOING_CHANNELS.map((c) => {
    const rows = filtered.filter((e) => e.channel === c.key);
    const total = r2(rows.reduce((s, e) => s + (e.totalCost ?? 0), 0));
    return { ...c, count: rows.length, total, pct: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0 };
  });

  /* بلا وجهة: عمليات قديمة سُجّلت قبل أن تصير الوجهة إلزامية */
  const unassigned = entries.filter((e) => !e.channel);
  const unassignedTotal = r2(unassigned.reduce((s, e) => s + (e.totalCost ?? 0), 0));
  const unassignedShown = filtered.filter((e) => !e.channel);
  const unassignedShownTotal = r2(unassignedShown.reduce((s, e) => s + (e.totalCost ?? 0), 0));

  /* حسب القسم */
  const byDept = [...filtered.reduce((m, e) => {
    const k = e.departmentName || "بلا قسم";
    m.set(k, r2((m.get(k) ?? 0) + (e.totalCost ?? 0)));
    return m;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  /* حسب الصنف */
  const byItem = [...filtered.reduce((m, e) => {
    const cur = m.get(e.itemBarcode) ?? { name: e.itemName, unit: e.unit, qty: 0, total: 0 };
    cur.qty = r2(cur.qty + (e.quantity ?? 0));
    cur.total = r2(cur.total + (e.totalCost ?? 0));
    m.set(e.itemBarcode, cur);
    return m;
  }, new Map<string, { name: string; unit: string; qty: number; total: number }>())]
    .map(([barcode, v]) => ({ barcode, ...v }))
    .sort((a, b) => b.total - a.total);

  /* حسب الجهة داخل القناة المختارة — حفلة بحفلة، عقداً بعقد، شهراً بشهر */
  const byParty = (() => {
    if (channelFilter === "concerts") {
      return [...filtered.filter((e) => e.channel === "concerts").reduce((m, e) => {
        const k = e.concertName || e.manualConcertName || "بلا حفلة";
        m.set(k, r2((m.get(k) ?? 0) + (e.totalCost ?? 0)));
        return m;
      }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    }
    if (channelFilter === "contracts") {
      return [...filtered.filter((e) => e.channel === "contracts").reduce((m, e) => {
        m.set(e.contractName || "بلا عقد", r2((m.get(e.contractName || "بلا عقد") ?? 0) + (e.totalCost ?? 0)));
        return m;
      }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    }
    if (channelFilter === "restaurant") {
      return [...filtered.filter((e) => e.channel === "restaurant").reduce((m, e) => {
        const k = (e.dispenseDate ?? "").slice(0, 7) || "بلا تاريخ";
        m.set(k, r2((m.get(k) ?? 0) + (e.totalCost ?? 0)));
        return m;
      }, new Map<string, number>())].sort((a, b) => a[0].localeCompare(b[0]));
    }
    return [] as [string, number][];
  })();

  // الحفلات المتاحة للإسناد: الملغاة مستبعدة، والأحدث تاريخاً أولاً
  const selectableConcerts = concerts
    .filter((c) => normalizeStatus(c.status) !== "cancelled")
    .sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">المنصرف</h2>
        <p className="text-sm text-slate-500">
          {entries.length} عملية منصرف مسجّلة — نظرة شاملة من كل الأقسام للمراجعة
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          تسجيل منصرف جديد يكون من داخل الحفلة أو العقد أو المطعم نفسه، لا من هنا.
        </p>
      </div>

      {/* عمليات قديمة سُجّلت قبل أن تصير الوجهة إلزامية — تكلفة حقيقية
          خارج كل الحسابات، فتُعرض بحجمها ويُفتح إسنادها بضغطة */}
      {unassigned.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-orange-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-orange-800">
                {unassigned.length} عملية بلا وجهة — بإجمالي{" "}
                <span className="tabular-nums-auto">{money(unassignedTotal)}</span> ريال
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                لا تدخل في المطعم ولا في أي حفلة ولا عقد. أسندها لتُحتسب.
              </p>
            </div>
          </div>
          {canReassign && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={openAssign}>
              <Undo2 size={14} /> إسناد الآن
            </Button>
          )}
        </div>
      )}

      {/* ══ طلبات صرف الحفلات ══
          تُنشأ تلقائياً عند تأكيد الحفلة بأصناف أكلها، ولا يُصرف منها
          شيء حتى يُقرّها المسؤول — والإقرار هو ما يُنشئ عمليات المنصرف */}
      {canSeeReq && requests.length > 0 && (
        <Card className="space-y-3 border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-amber-600" />
            <p className="font-bold text-slate-800">
              طلبات صرف بانتظار إقرارك ({requests.length})
            </p>
          </div>

          {requests.map((r) => {
            const total = r.lines.reduce((s, l) => s + l.quantity, 0);
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      {r.concertNumber > 0 && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          #{String(r.concertNumber).padStart(3, "0")}
                        </span>
                      )}
                      {r.clientName || r.concertName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.concertName}
                      {r.concertDate && ` · ${formatDate(r.concertDate)}`}
                      {" · "}
                      <span className="tabular-nums-auto">{r.lines.length}</span> صنف ·{" "}
                      <span className="tabular-nums-auto">{money(total)}</span> وحدة
                    </p>
                  </div>
                  {canApproveReq && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        loading={reqBusy === r.id}
                        onClick={() => handleRequest(r.id, "approve")}
                      >
                        <CheckCircle2 size={14} /> إقرار وصرف
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={reqBusy === r.id}
                        onClick={() => handleRequest(r.id, "reject")}
                      >
                        رفض
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {r.lines.map((l) => (
                    <span
                      key={l.barcode}
                      className="text-[11px] bg-slate-50 text-slate-700 px-2 py-0.5 rounded-full tabular-nums-auto"
                    >
                      {l.itemName} × {money(l.quantity)} {l.unit}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-slate-500">
            الإقرار يصرف الأصناف بمتوسط تكلفتها ويحمّلها على الحفلة. وتعديل أصناف الحفلة
            قبل الإقرار يُحدّث الطلب، وبعده يرجع المحذوف للمخزون ويصير المضاف طلباً جديداً.
          </p>
        </Card>
      )}

      {/* ══ التقسيم المفصَّل ══ */}
      {!loading && filtered.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-slate-800">التقسيم المفصَّل</p>
              <p className="text-xs text-slate-500">
                {filtered.length} عملية · إجمالي{" "}
                <span className="font-bold text-[#1C2D50] tabular-nums-auto">{money(grandTotal)}</span> ريال
                {(deptFilter || channelFilter || search.trim()) && " — حسب الفلاتر المطبَّقة"}
              </p>
            </div>
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-xs font-semibold text-[#1C2D50] hover:underline shrink-0"
            >
              {showBreakdown ? "إخفاء" : "إظهار"}
            </button>
          </div>

          {showBreakdown && (
            <>
              {/* بطاقات القنوات — مجموعها + ما بلا وجهة = الإجمالي بالضبط */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {byChannel.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setChannelFilter(channelFilter === c.key ? "" : c.key)}
                    className={`text-right rounded-xl border px-3 py-2.5 transition-colors ${
                      channelFilter === c.key
                        ? "border-[#1C2D50] bg-[#EEF1F7]"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-xs text-slate-500">{c.label}</p>
                    <p className="font-bold text-[#1C2D50] tabular-nums-auto">{money(c.total)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-slate-400 tabular-nums-auto">{c.count} عملية</span>
                      <span className="text-[10px] text-slate-400 tabular-nums-auto">{c.pct}%</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-[#1C2D50] rounded-full" style={{ width: `${c.pct}%` }} />
                    </div>
                  </button>
                ))}
              </div>

              {unassignedShown.length > 0 && (
                <button
                  onClick={() => setChannelFilter(channelFilter === "none" ? "" : "none")}
                  className={`w-full text-right rounded-xl border px-3 py-2 transition-colors ${
                    channelFilter === "none" ? "border-orange-400 bg-orange-50" : "border-orange-200 bg-orange-50/50 hover:bg-orange-50"
                  }`}
                >
                  <span className="text-xs text-orange-700 font-semibold">
                    بلا وجهة: {unassignedShown.length} عملية ·{" "}
                    <span className="tabular-nums-auto">{money(unassignedShownTotal)}</span> ريال
                  </span>
                </button>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* حسب القسم */}
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">حسب القسم</p>
                  <div className="space-y-1.5">
                    {byDept.map(([name, total]) => {
                      const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 truncate">{name}</span>
                            <span className="font-semibold text-slate-800 tabular-nums-auto shrink-0">{money(total)}</span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* حسب الصنف */}
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">حسب الصنف</p>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {byItem.map((i) => (
                      <div key={i.barcode} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-slate-600 truncate">{i.name}</span>
                        <span className="text-slate-400 tabular-nums-auto shrink-0">
                          {money(i.qty)} {i.unit}
                        </span>
                        <span className="font-semibold text-slate-800 tabular-nums-auto shrink-0 w-20 text-left">
                          {money(i.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* حسب الجهة داخل القناة المختارة */}
              {byParty.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">
                    {channelFilter === "concerts" ? "حسب الحفلة"
                      : channelFilter === "contracts" ? "حسب العقد"
                      : "حسب الشهر"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {byParty.map(([name, total]) => (
                      <div key={name} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <span className="text-slate-600 truncate">{name}</span>
                        <span className="font-semibold text-slate-800 tabular-nums-auto shrink-0">{money(total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالصنف أو العميل أو الحفلة أو الباركود..." />
      </div>
      <div className="flex gap-2 flex-wrap">
        {["", ...settings.departments.map((d) => d.name)].map((d) => (
          <button key={d || "all"} onClick={() => setDeptFilter(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${deptFilter === d ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {d || "كل الأقسام"}
          </button>
        ))}
      </div>
      <DateFilterBar value={dateF} onChange={setDateF} title="فلتر بتاريخ الصرف" matchedCount={filtered.length} unitLabel="عملية" />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <PackageMinus size={40} className="mb-3 opacity-40" />
          <p>لا توجد عمليات منصرف مطابقة</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                {fo.dest && <th className="px-4 py-3 font-semibold">القسم / الحفلة</th>}
                {(fo.date || fo.actor) && <th className="px-4 py-3 font-semibold">تاريخ الصرف</th>}
                {fo.cost && <th className="px-4 py-3 font-semibold">الإجمالي</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-none">
                  <td className="px-4 py-3 font-semibold text-slate-800">{e.itemName}</td>
                  <td className="px-4 py-3 text-slate-600">{e.unit}</td>
                  <td className="px-4 py-3 tabular-nums-auto">
                    {e.quantity.toLocaleString("en-US")}
                    {((e.returnedQty ?? 0) > 0 || (e.damagedQty ?? 0) > 0) && (
                      <span className="block text-[10px]">
                        {(e.returnedQty ?? 0) > 0 && (
                          <span className="text-emerald-600">مرتجع {e.returnedQty!.toLocaleString("en-US")}</span>
                        )}
                        {(e.returnedQty ?? 0) > 0 && (e.damagedQty ?? 0) > 0 && <span className="text-slate-300"> · </span>}
                        {(e.damagedQty ?? 0) > 0 && (
                          <span className="text-red-600">تالف {e.damagedQty!.toLocaleString("en-US")}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.contractId ? (
                      <>
                        <span className="text-slate-800">{e.contractName}</span>
                        <span className="block text-[10px] text-slate-400">عقد · {e.departmentName}</span>
                      </>
                    ) : e.concertId ? (
                      <>
                        <span className="text-slate-800">{e.clientName || e.concertName}</span>
                        <span className="block text-[10px] text-slate-400">{e.departmentName}</span>
                      </>
                    ) : e.manualConcertName ? (
                      <span className="inline-flex items-center gap-1 text-orange-600" title="غير مرتبط بحفلة — لا يدخل في تكلفتها">
                        <AlertTriangle size={11} /> {e.manualConcertName}
                      </span>
                    ) : (
                      e.departmentName
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto text-slate-500">
                    {e.dispenseDate ?? "—"}
                    <Actor uid={e.createdBy} className="block mt-0.5" showIcon={false} />
                  </td>
                  <td className="px-4 py-3 tabular-nums-auto font-semibold text-[#1C2D50]">{e.totalCost.toLocaleString("en-US")} ريال</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canSettle && e.quantity - (e.returnedQty ?? 0) - (e.damagedQty ?? 0) > 0 && (
                        <button onClick={() => openSettle(e)} title="إرجاع للمخزون أو تسجيل تالف"
                          className="text-slate-400 hover:text-emerald-600 transition-colors">
                          <Undo2 size={14} />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(e)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />

      {/* إرجاع / تالف — يُستعمل غالباً بعد إلغاء حفلة صُرفت خاماتها */}
      <Modal open={!!settleTarget} onClose={() => setSettleTarget(null)} title="إرجاع أو تسجيل تالف">
        {settleTarget && (() => {
          const remaining = settleTarget.quantity - (settleTarget.returnedQty ?? 0) - (settleTarget.damagedQty ?? 0);
          const ret = parseFloat(settleForm.returned) || 0;
          const dmg = parseFloat(settleForm.damaged) || 0;
          const over = ret + dmg > remaining + 1e-9;
          const consumed = settleTarget.quantity - (settleTarget.returnedQty ?? 0) - (settleTarget.damagedQty ?? 0) - ret - dmg;
          return (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <p className="font-bold text-slate-800 text-sm">{settleTarget.itemName}</p>
                <p className="text-[11px] text-slate-500 tabular-nums-auto mt-0.5">
                  صُرف {settleTarget.quantity.toLocaleString("en-US")} {settleTarget.unit}
                  {settleTarget.clientName || settleTarget.concertName
                    ? ` · ${settleTarget.clientName || settleTarget.concertName}`
                    : ` · ${settleTarget.departmentName}`}
                  {" · "}المتبقي غير المسوّى {remaining.toLocaleString("en-US")} {settleTarget.unit}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label={`رجع للمخزون (${settleTarget.unit})`} type="number" min={0} step="0.001"
                  value={settleForm.returned} onChange={(e) => setSettleForm({ ...settleForm, returned: e.target.value })} />
                <Input label={`تالف (${settleTarget.unit})`} type="number" min={0} step="0.001"
                  value={settleForm.damaged} onChange={(e) => setSettleForm({ ...settleForm, damaged: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="سبب التلف" value={settleForm.reason} placeholder="مثال: إلغاء الحفلة وتلف الخلطة"
                  onChange={(e) => setSettleForm({ ...settleForm, reason: e.target.value })} />
                <Input label="التاريخ" type="date" value={settleForm.date}
                  onChange={(e) => setSettleForm({ ...settleForm, date: e.target.value })} />
              </div>

              {over ? (
                <p className="text-xs text-red-600 font-semibold">
                  المجموع أكبر من المتبقي ({remaining.toLocaleString("en-US")} {settleTarget.unit})
                </p>
              ) : (
                <div className="text-xs text-slate-600 bg-[#EEF1F7] border border-[#D4DCE8] rounded-xl px-3 py-2.5 leading-relaxed tabular-nums-auto">
                  المرتجع يعود للرصيد · التالف لا يعود ويُقيَّد خسارة عامة لا تكلفة حفلة.
                  <br />
                  ستُصبح التكلفة المحمَّلة على الحفلة{" "}
                  <span className="font-bold text-[#1C2D50]">
                    {(Math.round(consumed * settleTarget.unitPrice * 100) / 100).toLocaleString("en-US")} ريال
                  </span>{" "}
                  ({consumed.toLocaleString("en-US")} {settleTarget.unit} استُهلكت فعلاً)
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <Button variant="secondary" type="button" onClick={() => setSettleTarget(null)}>إلغاء</Button>
                <Button onClick={handleSettle} loading={saving} disabled={over || ret + dmg <= 0}>حفظ</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف عملية المنصرف"
        message={`سيُعاد ${deleteTarget ? deleteTarget.quantity - (deleteTarget.returnedQty ?? 0) : 0} ${deleteTarget?.unit} إلى رصيد "${deleteTarget?.itemName}". متابعة؟`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* ── إسناد العمليات القديمة إلى وجهاتها ── */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="إسناد عمليات بلا وجهة" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            هذه عمليات سُجّلت قبل أن تصير الوجهة إلزامية، فتكلفتها خارج كل الحسابات.
            اختر ما يخصّ جهة واحدة ثم حدّد وجهتها — وكرّر للباقي.
          </p>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {unassigned.map((e) => (
              <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={assignPicked.has(e.id)}
                  onChange={() => setAssignPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                    return next;
                  })}
                  className="accent-[#1C2D50] shrink-0"
                  style={{ width: 15, height: 15 }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{e.itemName}</span>
                  <span className="block text-[11px] text-slate-400 tabular-nums-auto">
                    {e.departmentName} · {money(e.quantity)} {e.unit} · {e.dispenseDate}
                    {e.manualConcertName && ` · «${e.manualConcertName}»`}
                  </span>
                </span>
                <span className="font-bold text-[#1C2D50] text-sm tabular-nums-auto shrink-0">
                  {money(e.totalCost ?? 0)}
                </span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">وجهة المحدَّد</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OUTGOING_CHANNELS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setAssignChannel(c.key); setAssignConcert(null); setAssignContract(null); }}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                    assignChannel === c.key
                      ? "border-[#1C2D50] bg-[#1C2D50] text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {assignChannel === "concerts" && (
            <Select
              label="الحفلة"
              value={assignConcert?.id ?? ""}
              onChange={(ev) => setAssignConcert(concerts.find((c) => c.id === ev.target.value) ?? null)}
            >
              <option value="">— اختر الحفلة —</option>
              {selectableConcerts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.clientName ? ` — ${c.clientName}` : ""}
                </option>
              ))}
            </Select>
          )}

          {assignChannel === "contracts" && (
            <Select
              label="العقد"
              value={assignContract?.id ?? ""}
              onChange={(ev) => setAssignContract(contracts.find((c) => c.id === ev.target.value) ?? null)}
            >
              <option value="">— اختر العقد —</option>
              {contracts.filter((c) => c.status === "active").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500 tabular-nums-auto">
              {assignPicked.size} عملية ·{" "}
              {money(unassigned.filter((e) => assignPicked.has(e.id)).reduce((s, e) => s + (e.totalCost ?? 0), 0))} ريال
            </span>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" onClick={() => setShowAssign(false)}>إلغاء</Button>
              <Button onClick={handleAssign} loading={saving} disabled={!assignChannel || assignPicked.size === 0}>
                إسناد
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
