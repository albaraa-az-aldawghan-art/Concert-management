import { UsersRound } from "lucide-react";
import { toLatinDigits } from "@/lib/utils";

/** Preserve recorded counts/ranges; do not turn an unspecified count into zero. */
export function ConcertPeopleCount({ value }: { value?: string | number | null }) {
  const count = toLatinDigits(String(value ?? "")).trim();
  return (
    <span
      aria-label={`عدد الأشخاص: ${count || "غير محدد"}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${count ? "bg-[#EEF1F7] text-[#1C2D50]" : "bg-slate-100 text-slate-500"}`}
    >
      <UsersRound size={13} aria-hidden="true" className="shrink-0" />
      <span className="shrink-0">الأشخاص</span>
      <bdi dir="ltr" className="min-w-0 break-words font-semibold tabular-nums">{count || "غير محدد"}</bdi>
    </span>
  );
}
