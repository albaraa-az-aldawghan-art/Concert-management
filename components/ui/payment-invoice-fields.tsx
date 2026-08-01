"use client";

import { PaymentMethod } from "@/types";
import { FileText, FileX, Check, X, Lock } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   حالة فاتورة الدفعة — اختيارية دائماً.

   الشبكة لها فاتورة بطبيعتها، فلا يُسأل عن وجودها بل عن تسجيلها
   فقط. أما الكاش والتحويل فقد يكونان بفاتورة أو بدونها، وإن كانت
   بفاتورة فقد تُسجَّل لاحقاً.

   قيمة null تعني «لم تُحدَّد بعد» وهي مختلفة عن false («بدون
   فاتورة» أو «غير مسجّلة») — خلطهما يجعل ما لم يُراجَع بعد يبدو
   محسوماً، فتظهر الدفعات القديمة وكأن أحداً بتّ فيها.
   ═══════════════════════════════════════════════════════════════ */

export interface InvoiceState {
  hasInvoice: boolean | null;
  invoiceRegistered: boolean | null;
}

/** القيم التلقائية عند اختيار وسيلة الدفع */
export function defaultInvoiceFor(method: PaymentMethod): InvoiceState {
  // الشبكة: الفاتورة مؤكَّدة، والتسجيل يختاره المستخدم
  return method === "card"
    ? { hasInvoice: true, invoiceRegistered: null }
    : { hasInvoice: null, invoiceRegistered: null };
}

export function invoiceLabel(
  v: { hasInvoice?: boolean | null; invoiceRegistered?: boolean | null }
): { text: string; cls: string } | null {
  if (v.hasInvoice === null || v.hasInvoice === undefined) return null;
  if (!v.hasInvoice) return { text: "بدون فاتورة", cls: "bg-slate-100 text-slate-600" };
  if (v.invoiceRegistered === true) return { text: "فاتورة مسجّلة", cls: "bg-emerald-50 text-emerald-700" };
  if (v.invoiceRegistered === false) return { text: "فاتورة غير مسجّلة", cls: "bg-amber-50 text-amber-700" };
  return { text: "بفاتورة", cls: "bg-[#EEF1F7] text-[#1C2D50]" };
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
  // الشبكة بفاتورة دائماً — تُثبَّت هنا فلا يعتمد الحفظ على ضغطة زر
  const hasInvoice = isCard ? true : value.hasInvoice;

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
              onClick={() => onChange({ hasInvoice: true, invoiceRegistered: value.invoiceRegistered ?? null })}>
              <FileText size={13} /> بفاتورة
            </Choice>
            <Choice active={value.hasInvoice === false}
              onClick={() => onChange({ hasInvoice: false, invoiceRegistered: null })}>
              <FileX size={13} /> بدون فاتورة
            </Choice>
          </div>
        )}

        {hasInvoice === true && (
          <div className="flex gap-2">
            <Choice active={value.invoiceRegistered === true}
              onClick={() => onChange({ hasInvoice: true, invoiceRegistered: true })}>
              <Check size={13} /> سُجّلت الفاتورة
            </Choice>
            <Choice active={value.invoiceRegistered === false}
              onClick={() => onChange({ hasInvoice: true, invoiceRegistered: false })}>
              <X size={13} /> لم تُسجَّل بعد
            </Choice>
          </div>
        )}
      </div>
    </div>
  );
}
