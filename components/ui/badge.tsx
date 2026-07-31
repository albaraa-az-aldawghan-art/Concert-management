import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_VARIANT, normalizeStatus } from "@/lib/concert-status";

type BadgeVariant = "blue" | "green" | "red" | "yellow" | "gray" | "indigo" | "orange";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  blue: "bg-[#D4DCE8] text-[#1C2D50] border-[#D4DCE8]",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// حالات غير خاصة بالحفلة (المواد، الطلبات، الدفع). لاحظ أن "confirmed"
// مشتركة بينها وبين حالات الحفلة، لذا تُفحص حالات الحفلة أولاً.
const OTHER_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending:     { label: "قيد الانتظار",   variant: "yellow" },
  approved:    { label: "موافق عليه",     variant: "green"  },
  rejected:    { label: "مرفوض",          variant: "red"    },
  has_missing: { label: "به مفقودات",     variant: "red"    },
  internal:    { label: "داخلي",          variant: "indigo" },
  external:    { label: "خارجي",          variant: "orange" },
  paid:        { label: "تم الدفع",       variant: "green"  },
  unpaid:      { label: "لم يُدفع بعد",   variant: "yellow" },
};

/** شارة حالة الحفلة — تمرّ دائماً عبر normalizeStatus فلا تظهر شارة
 *  فارغة لأي حالة قديمة أو غير معروفة (كما كان يحدث مع «ملغاة»). */
export function StatusBadge({ status }: { status: string }) {
  const other = OTHER_STATUS[status];
  if (other && !(status in STATUS_LABEL)) {
    return <Badge variant={other.variant}>{other.label}</Badge>;
  }
  const key = normalizeStatus(status);
  return <Badge variant={STATUS_VARIANT[key]}>{STATUS_LABEL[key]}</Badge>;
}
