"use client";

import { PaymentMethod } from "@/types";
import { toLatinDigits } from "@/lib/utils";
import { FileText, FileX, Lock, Check, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   حالة فاتورة الدفعة.

   الشبكة لها فاتورة بطبيعتها فلا يُسأل عن وجودها. أما الكاش والتحويل
   فقد يكونان بفاتورة أو بدونها.

   والتسجيل ليس زراً يُضغط بل يُشتقّ من رقم الفاتورة: رقمٌ مكتوب يعني
   أنها سُجّلت، وفراغٌ يعني أنها لم تُسجَّل بعد. هكذا لا يمكن أن تُعلَّم
   دفعة «مسجّلة» بلا رقم يُرجَع إليه.
   ═══════════════════════════════════════════════════════════════ */

export interface InvoiceState {
  hasInvoice: boolean | null;
  invoiceNumber: string;
}

export function defaultInvoiceFor(method: PaymentMethod): InvoiceState {
  // الشبكة: الفاتورة مؤكَّدة، ورقمها يُكتب إن سُجّلت
  return method === "card"
    ? { hasInvoice: true, invoiceNumber: "" }
    : { hasInvoice: null, invoiceNumber: "" };
}

/** ما يُحفظ في قاعدة البيانات من حالة النموذج */
export function invoiceToSave(method: PaymentMethod, v: InvoiceState) {
  const hasInvoice = method === "card" ? true : v.hasInvoice;
  const number = hasInvoice ? v.invoiceNumber.trim() : "";
  return {
    hasInvoice,
    invoiceNumber: number || null,
    invoiceRegistered: hasInvoice ? number.length > 0 : null,
  };
}

export function invoiceLabel(
  v: { hasInvoice?: boolean | null; invoiceRegistered?: boolean | null; invoiceNumber?: string | null }
): { text: string; cls: string } | null {
  if (v.hasInvoice === null || v.hasInvoice === undefined) return null;
  if (!v.hasInvoice) return { text: "بدون فاتورة", cls: "bg-slate-100 text-slate-600" };
  const num = v.invoiceNumber?.trim();
  if (num) return { text: `فاتورة مسجّلة · ${num}`, cls: "bg-emerald-50 text-emerald-700" };
  // دفعات قديمة عُلِّمت مسجّلة قبل وجود حقل الرقم
  if (v.invoiceRegistered === true) return { text: "فاتورة مسجّلة", cls: "bg-emerald-50 text-emerald-700" };
  return { text: "فاتورة لم تُسجَّل", cls: "bg-amber-50 text-amber-700" };
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
        active ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

export function PaymentInvoiceFields({
  method,
  value,
  onChange,
}: {
  method: PaymentMethod;
  value: InvoiceState;
  onChange: (v: InvoiceState) => void;
}) {
  const isCard = method === "card";
  const hasInvoice = isCard ? true : value.hasInvoice;
  const registered = value.invoiceNumber.trim().length > 0;

  return (
    <div>
      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
        الفاتورة <span className="text-xs font-normal text-slate-400">(اختياري)</span>
      </label>

      <div className="space-y-2">
        {isCard ? (
          <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-700">
            <FileText size={13} /> شبكة — بفاتورة
            <Lock size={11} className="opacity-60 mr-auto" />
          </div>
        ) : (
          <div className="flex gap-2">
            <Choice active={value.hasInvoice === true}
              onClick={() => onChange({ hasInvoice: true, invoiceNumber: value.invoiceNumber })}>
              <FileText size={13} /> بفاتورة
            </Choice>
            <Choice active={value.hasInvoice === false}
              onClick={() => onChange({ hasInvoice: false, invoiceNumber: "" })}>
              <FileX size={13} /> بدون فاتورة
            </Choice>
          </div>
        )}

        {hasInvoice === true && (
          <div>
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={value.invoiceNumber}
              onChange={(e) => onChange({ hasInvoice: true, invoiceNumber: toLatinDigits(e.target.value) })}
              placeholder="رقم الفاتورة"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center tabular-nums-auto focus:outline-none focus:ring-2 focus:ring-[#1C2D50]"
            />
            <p className={`text-[11px] mt-1 flex items-center gap-1 ${registered ? "text-emerald-600" : "text-amber-600"}`}>
              {registered ? <Check size={11} /> : <X size={11} />}
              {registered ? "ستُحفظ: فاتورة مسجّلة" : "اتركه فارغاً إن لم تُسجَّل — ستُحفظ: فاتورة لم تُسجَّل"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
