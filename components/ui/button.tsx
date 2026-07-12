"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const variants = {
    primary:   "bg-[#1C2D50] hover:bg-[#263C6E] text-[#D4DCE8] focus:ring-[#1C2D50] shadow-sm hover:shadow-md",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 focus:ring-slate-400",
    danger:    "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-sm",
    success:   "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-sm",
    ghost:     "hover:bg-slate-100 text-slate-600 focus:ring-slate-400",
    outline:   "border-2 border-[#1C2D50] text-[#1C2D50] hover:bg-[#F4F6FA] focus:ring-[#1C2D50]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm min-h-[36px]",
    md: "px-4 py-2 text-sm min-h-[42px]",
    lg: "px-6 py-3 text-base min-h-[48px]",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
