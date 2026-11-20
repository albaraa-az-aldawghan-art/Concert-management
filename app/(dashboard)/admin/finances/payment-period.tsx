"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/concert-status";
import { getConcertById } from "@/lib/firestore/concerts";
import { toLatinDigits } from "@/lib/utils";
import type { FinancePayment, FinancePaymentReport } from "@/lib/finance-payments";
import type { Concert, PaymentMethod } from "@/types";

const PAGE_SIZE = 20;
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABELS: Record<PaymentMethod, string> = { card: "شبكة", cash: "نقدي", bank_transfer: "تحويل بنكي" };
const CARD_LABELS = { mada: "مدى", visa: "فيزا" };

function PaymentMethodDetails({ payment, showBankDetails }: { payment: FinancePayment; showBankDetails: boolean }) {
  const method = payment.method ? METHOD_LABELS[payment.method] : "وسيلة الدفع غير مسجلة";
  const card = payment.cardType && CARD_LABELS[payment.cardType];
  const hasBankDetails = showBankDetails && (payment.bankName || payment.senderName || payment.receiverName);
  return (
    <div className="mt-2 text-xs text-slate-600">
      <p className="inline-block rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
        {method}{card && ` · ${card}`}
      </p>
      {hasBankDetails && <dl className="mt-1 space-y-1">
        {payment.bankName && <div><dt className="inline font-medium">البنك </dt><dd className="inline"><bdi>{payment.bankName}</bdi></dd></div>}
        {payment.senderName && <div><dt className="inline font-medium">المحوّل </dt><dd className="inline"><bdi>{payment.senderName}</bdi></dd></div>}
        {payment.receiverName && <div><dt className="inline font-medium">المستلم </dt><dd className="inline"><bdi>{payment.receiverName}</bdi></dd></div>}
      </dl>}
    </div>
  );
}

interface Props {
  from: string;
  to: string;
  custom: boolean;
  concerts: Concert[];
  showClient: boolean;
  showTotal: boolean;
  showBankDetails: boolean;
  canOpenConcerts: boolean;
}

export function PaymentPeriod({ from, to, custom, concerts, showClient, showTotal, showBankDetails, canOpenConcerts }: Props) {
  const [report, setReport] = useState<FinancePaymentReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [lookupById, setLookupById] = useState(new Map<string, Concert | null | "error">());
  const concertById = useMemo(() => new Map(concerts.map(concert => [concert.id, concert])), [concerts]);
  const visible = useMemo(() => report?.payments?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [report, page]);
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

  useEffect(() => {
    if (!visible) return;
    const ids = [...new Set(visible.map(payment => payment.concertId))]
      .filter(id => id && !concertById.has(id) && !lookupById.has(id));
    if (!ids.length) return;

    let active = true;
    void Promise.all(ids.map(async id => {
      try {
        return [id, await getConcertById(id)] as const;
      } catch {
        return [id, "error"] as const;
      }
    })).then(entries => {
      if (active) setLookupById(current => new Map([...current, ...entries]));
    });
    return () => { active = false; };
  }, [visible, concertById, lookupById]);

  if (missingDates) return <Card><p className="text-sm text-slate-600">اختر تاريخ البداية أو النهاية. لعرض يوم واحد، حدّد التاريخ نفسه في الخانتين.</p></Card>;
  if (reversed) return <Card><p role="alert" className="text-sm text-red-700">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p></Card>;
  if (error) return <Card>
    <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>
    <Button variant="outline" size="sm" onClick={() => { setError(""); setRetry(value => value + 1); }}>إعادة المحاولة</Button>
  </Card>;
  if (!report) return <Card><p role="status" className="text-sm text-slate-500">جارٍ تحميل دفعات الفترة…</p></Card>;

  const totalPages = Math.max(1, Math.ceil(report.count / PAGE_SIZE));

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
            const resolved = concertById.get(payment.concertId) ?? lookupById.get(payment.concertId);
            const concert = resolved === "error" ? null : resolved;
            const title = showClient && concert ? (concert.name?.trim() || concert.clientName?.trim() || "الحفلة") : "الحفلة";
            const client = showClient && concert?.clientName?.trim();
            const number = concert?.concertNumber;
            let concertStatus = "";
            if (concert) concertStatus = statusLabel(concert.status);
            else if (!payment.concertId) concertStatus = "الدفعة بدون مرجع حفلة";
            else if (resolved === "error") concertStatus = "تعذّر التحقق من سجل الحفلة";
            else if (resolved === null) concertStatus = "سجل الحفلة المرتبطة غير موجود";
            else concertStatus = "جارٍ التحقق من الحفلة المرتبطة…";
            return <li key={payment.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 break-words text-sm">
                {canOpenConcerts && concert ? <Link href={`/admin/concerts/${encodeURIComponent(concert.id)}`} className="font-semibold text-[#1C2D50] underline underline-offset-2">{toLatinDigits(title)}</Link> : <span className="font-semibold text-slate-800">{toLatinDigits(title)}</span>}
                {number != null && <> <bdi dir="ltr" className="text-xs text-slate-500">#{number}</bdi></>}
                {client && client !== title && <p className="mt-1 text-xs text-slate-500">العميل {toLatinDigits(client)}</p>}
                <p className="mt-1 text-xs text-slate-500">{concertStatus}</p>
                {!concert && <p className="mt-1 text-xs text-slate-500">مرجع الدفعة <bdi dir="ltr" className="break-all">{payment.id}</bdi></p>}
                <PaymentMethodDetails payment={payment} showBankDetails={showBankDetails} />
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
