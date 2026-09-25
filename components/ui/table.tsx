import React from "react";
import { cn } from "@/lib/utils";

export function TableShell({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("data-table-shell", className)} {...props}>
      {children}
    </div>
  );
}

export function DataTable({
  className,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("data-table", className)} {...props}>
      {children}
    </table>
  );
}

export function TableIconButton({
  label,
  tone = "default",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "table-icon-button",
        tone === "danger" && "table-icon-button-danger",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
