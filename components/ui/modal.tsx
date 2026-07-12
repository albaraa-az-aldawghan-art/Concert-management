"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({ open, onClose, title, children, className, size = "md" }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] anim-fade-in"
        onClick={onClose}
      />
      {/* Bottom sheet on phones, centered dialog on larger screens */}
      <div
        className={cn(
          "relative w-full bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 max-h-[88vh] overflow-y-auto",
          "anim-slide-up sm:anim-scale-in",
          "pb-[env(safe-area-inset-bottom)]",
          sizes[size],
          className
        )}
      >
        {/* Grab handle — visual affordance on phones only */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 -m-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-500 transition-colors"
              aria-label="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  variant = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}) {
  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-[#1C2D50] hover:bg-[#111D35] text-white";

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 transition-all"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            "px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50",
            confirmClass
          )}
        >
          {loading ? "جارٍ التنفيذ..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
