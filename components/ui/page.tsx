import React from "react";
import { LucideIcon, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function PageShell({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("page-shell space-y-5 sm:space-y-6", className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("page-heading", className)}>
      <div className="min-w-0 flex items-start gap-3">
        {Icon && (
          <div className="page-heading-icon" aria-hidden="true">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <div className="page-description">{description}</div>}
          {children}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("section-heading", className)}>
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type StatTone = "navy" | "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<StatTone, { icon: string; value: string }> = {
  navy: { icon: "bg-[#EEF1F7] text-[#1C2D50]", value: "text-[#1C2D50]" },
  success: { icon: "bg-emerald-50 text-emerald-700", value: "text-emerald-700" },
  warning: { icon: "bg-amber-50 text-amber-700", value: "text-amber-700" },
  danger: { icon: "bg-red-50 text-red-700", value: "text-red-700" },
  neutral: { icon: "bg-slate-100 text-slate-600", value: "text-slate-800" },
};

export function StatCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = "navy",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}) {
  const colors = toneClasses[tone];
  return (
    <Card className={cn("stat-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="stat-label">{label}</p>
          <p className={cn("stat-value tabular-nums-auto", colors.value)}>{value}</p>
        </div>
        {Icon && (
          <div className={cn("stat-icon", colors.icon)} aria-hidden="true">
            <Icon size={19} />
          </div>
        )}
      </div>
      {(suffix || hint) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>{suffix}</span>
          <span>{hint}</span>
        </div>
      )}
    </Card>
  );
}

export function LoadingState({ label = "جارٍ تحميل البيانات...", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("state-panel", className)} role="status" aria-live="polite">
      <LoaderCircle size={28} className="animate-spin text-[#1C2D50]" />
      <p className="text-sm font-semibold text-slate-600">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("state-panel", className)}>
      {Icon && <Icon size={32} className="text-slate-300" aria-hidden="true" />}
      <div className="space-y-1">
        <p className="font-bold text-slate-700">{title}</p>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function FilterPanel({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("filter-panel", className)}>{children}</div>;
}
