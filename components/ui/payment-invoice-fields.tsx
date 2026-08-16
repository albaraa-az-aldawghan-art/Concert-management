"use client";

/* فاتورة الحفلة: واحدة للحفلة كلها، والتسجيل يُشتقّ من رقمها. */
import { toLatinDigits } from "@/lib/utils";
import { FileText, FileX, Check, X, AlertTriangle } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   الفاتورة للحفلة لا للدفعة.

   كانت على الدفعة، فحفلةٌ تُدفع على ثلاث دفعات كانت تحتمل ثلاثة أرقام
   فواتير لعملٍ واحد — وهو ما لا يقابله شيء في الدفاتر. والعميل يطلب
   فاتورةً واحدة عن حفلته مهما تعدّدت دفعاته.

   والتسجيل ليس زراً يُضغط بل يُشتقّ من الرقم: رقمٌ مكتوب يعني أنها
   سُجّلت، وفراغٌ يعني أنها لم تُسجَّل بعد. فلا تُعلَّم حفلة «مسجّلة»
   بلا رقم يُرجَع إليه.
   ═══════════════════════════════════════════════════════════════ */

export interface InvoiceState {
  hasInvoice: boolean | null;
  invoiceNumber: string;
}

export function invoiceLabel(
  v: { hasInvoice?: boolean | null; invoiceRegistered?: boolean | null; invoiceNumber?: string | null }
): { text: string; cls: string } | null {
  if (v.hasInvoice === null || v.hasInvoice === undefined) return null;
  if (!v.hasInvoice) return { text: "بدون فاتورة", cls: "bg-slate-100 text-slate-600" };
  const num = v.invoiceNumber?.trim();
  if (num) return { text: `فاتورة مسجّلة · ${num}`, cls: "bg-emerald-50 text-emerald-700" };
  if (v.invoiceRegistered === true) return { text: "فاتورة مسجّلة", cls: "bg-emerald-50 text-emerald-700" };
  return { text: "فاتورة لم تُسجَّل", cls: "bg-amber-50 text-amber-700" };
}

function Choice({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
        active ? "border-[#1C2D50] bg-[#EEF1F7] text-[#1C2D50]" : "border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

/** حقول فاتورة الحفلة.
 *  `hasCardPayment` يُظهر تنبيهاً حين تُختار «بدون فاتورة» ودُفع بالشبكة
 *  — تنبيهٌ لا مَنع، فقد يكون للحفلة سببها. */
export function ConcertInvoiceFields({
  value, onChange, hasCardPayment,
}: {
  value: InvoiceState;
  onChange: (v: InvoiceState) => void;
  hasCardPayment?: boolean;
}) {
  const registered = value.invoiceNumber.trim().length > 0;

  return (
    <div className="space-y-2">
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

      {hasCardPayment && value.hasInvoice === false && (
        <p className="text-[11px] text-orange-600 flex items-start gap-1">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          في هذه الحفلة دفعة بالشبكة — وعادةً لها فاتورة
        </p>
      )}

      {value.hasInvoice === true && (
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
  );
}
