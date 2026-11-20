"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/concert-status";
import type { FinancePaymentReport } from "@/lib/finance-payments";
import type { Concert } from "@/types";

const PAGE_SIZE = 20;
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  from: string;
  to: string;
  custom: boolean;
  concerts: Concert[];
  showClient: boolean;
  showTotal: boolean;
  canOpenConcerts: boolean;
}

export function PaymentPeriod({ from, to, custom, concerts, showClient, showTotal, canOpenConcerts }: Props) {
  const [report, setReport] = useState<FinancePaymentReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const missingDates = custom && !from && !to;
  const reversed = Boolean(from && to && from > to);

  useEffect(() => {
    if (missingDates || reversed) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ from, to });
      api.get<FinancePaymentReport>(`/api/finances/payments?${params}`)
        .then(data => { if (active) setReport(data); })
        .catch(err => { if (active) setError(err instanceof Error ? err.message : "تعذّر تحميل الدفعات."); });
    }, custom ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [from, to, custom, missingDates, reversed, retry]);

  if (missingDates) return <Card><p className="text-sm text-slate-600">اختر تاريخ البداية أو النهاية. لعرض يوم واحد، حدّد التاريخ نفسه في الخانتين.</p></Card>;
  if (reversed) return <Card><p role="alert" className="text-sm text-red-700">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p></Card>;
  if (error) return <Card>
    <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>
    <Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(value => value + 1); }}>إعادة المحاولة</Button>
  </Card>;
  if (!report) return <Card><p role="status" className="text-sm text-slate-500">جارٍ تحميل دفعات الفترة…</p></Card>;

  const concertById = new Map(concerts.map(concert => [concert.id, concert]));
  const totalPages = Math.max(1, Math.ceil(report.count / PAGE_SIZE));
  const visible = report.payments?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section aria-label="دفعات الحفلات" className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-[#1C2D50]"><Wallet size={18} /> المحصّل من دفعات الحفلات في الفترة</h3>
            <p className="mt-1 text-xs text-slate-500">{report.count} دفعة مسجلة · قبل خصم المبالغ المستردة</p>
          </div>
          {showTotal && <p className="text-xl font-bold tabular-nums text-emerald-700"><bdi dir="ltr">{money.format(report.totalHalalas / 100)}</bdi> ريال</p>}
        </div>
      </Card>
      {visible && <Card>
        <h3 className="mb-3 font-bold text-slate-800">تفاصيل الدفعات</h3>
        {visible.length ? <ul className="divide-y divide-slate-100">
          {visible.map(payment => {
            const concert = concertById.get(payment.concertId);
            const title = showClient && concert ? (concert.clientName || concert.name) : "الحفلة";
            const number = concert?.concertNumber;
            return <li key={payment.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 break-words text-sm">
                {canOpenConcerts && concert ? <Link href={`/admin/concerts/${encodeURIComponent(concert.id)}`} className="font-semibold text-[#1C2D50] underline underline-offset-2">{title}</Link> : <span className="font-semibold text-slate-800">{title}</span>}
                {number != null && <> <bdi dir="ltr" className="text-xs text-slate-500">#{number}</bdi></>}
                <div className="mt-1 text-xs text-slate-500">{concert ? statusLabel(concert.status) : "سجل الحفلة غير متاح"}</div>
              </div>
              <div className="shrink-0 text-end">
                <p className="font-semibold tabular-nums text-emerald-700"><bdi dir="ltr">{money.format(payment.amountHalalas / 100)}</bdi> ريال</p>
                <p className="mt-1 text-xs text-slate-500"><bdi dir="ltr">{payment.date ?? ""}</bdi>{!payment.date && "التاريخ غير مسجل"}</p>
              </div>
            </li>;
          })}
        </ul> : <p className="text-sm text-slate-500">لا توجد دفعات في الفترة المحددة.</p>}
        {totalPages > 1 && <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</Button>
          <span className="text-xs text-slate-500">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(value => value + 1)}>التالي</Button>
        </div>}
      </Card>}
    </section>
  );
}
