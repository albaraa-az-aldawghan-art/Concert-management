"use client";

import { useState } from "react";
import { PaymentMethod } from "@/types";
import { FileText, FileX, Check, X, Pencil } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   حالة فاتورة الدفعة — اختيارية دائماً.

   الشبكة تُصدر فاتورةً مسجّلة بطبيعتها، فتُملأ تلقائياً ولا تُسأل
   عنها. أما الكاش والتحويل فقد يكونان بفاتورة أو بدونها، وإن كانت
   بفاتورة فقد تُسجَّل لاحقاً — فيُسأل عنهما.

   القيمة null تعني «لم تُحدَّد بعد» وهي مختلفة عن «بدون فاتورة»،
   فخلطهما يجعل ما لم يُراجَع بعد يبدو محسوماً.
   ═══════════════════════════════════════════════════════════════ */

export interface InvoiceState {
  hasInvoice: boolean | null;
  invoiceRegistered: boolean | null;
}

/** القيم التلقائية عند اختيار وسيلة الدفع */
export function defaultInvoiceFor(method: PaymentMethod): InvoiceState {
  return method === "card"
    ? { hasInvoice: true, invoiceRegistered: true }
    : { hasInvoice: null, invoiceRegistered: null };
}

export function invoiceLabel(
  v: { hasInvoice?: boolean | null; invoiceRegistered?: boolean | null }
): { text: string; cls: string } | null {
  if (v.hasInvoice === null || v.hasInvoice === undefined) return null;
  if (!v.hasInvoice) return { text: "بدون فاتورة", cls: "bg-slate-100 text-slate-600" };
  return v.invoiceRegistered
    ? { text: "فاتورة مسجّلة", cls: "bg-emerald-50 text-emerald-700" }
    : { text: "فاتورة غير مسجّلة", cls: "bg-amber-50 text-amber-700" };
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
  allowEdit = false,
}: {
  method: PaymentMethod;
  value: InvoiceState;
  onChange: (v: InvoiceState) => void;
  /** إظهار زر تعديل حالة الشبكة — في تفاصيل الحفلة فقط، لا عند الإنشاء */
  allowEdit?: boolean;
}) {
  // الشبكة تُعرض كملاحظة تلقائية، وتُفتح للتعديل عند الحاجة فقط
  const [editingCard, setEditingCard] = useState(false);
  const isAutoCard = method === "card" && !(allowEdit && editingCard);

  return (
    <div>
      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
        الفاتورة <span className="text-xs font-normal text-slate-400">(اختياري)</span>
      </label>

      {isAutoCard ? (
        <div className="flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2.5">
          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <FileText size={13} />
            {value.hasInvoice === false
              ? "بدون فاتورة"
              : value.invoiceRegistered === false
                ? "فاتورة غير مسجّلة"
                : "شبكة — فاتورة مسجّلة تلقائياً"}
          </span>
          {allowEdit && (
            <button type="button" onClick={() => setEditingCard(true)}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 shrink-0">
              <Pencil size={11} /> تعديل
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Choice active={value.hasInvoice === true}
              onClick={() => onChange({ hasInvoice: true, invoiceRegistered: value.invoiceRegistered ?? false })}>
              <FileText size={13} /> بفاتورة
            </Choice>
            <Choice active={value.hasInvoice === false}
              onClick={() => onChange({ hasInvoice: false, invoiceRegistered: null })}>
              <FileX size={13} /> بدون فاتورة
            </Choice>
          </div>

          {value.hasInvoice === true && (
            <div className="flex gap-2">
              <Choice active={value.invoiceRegistered === true}
                onClick={() => onChange({ hasInvoice: true, invoiceRegistered: true })}>
                <Check size={13} /> سُجّلت الفاتورة
              </Choice>
              <Choice active={value.invoiceRegistered !== true}
                onClick={() => onChange({ hasInvoice: true, invoiceRegistered: false })}>
                <X size={13} /> لم تُسجَّل بعد
              </Choice>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
