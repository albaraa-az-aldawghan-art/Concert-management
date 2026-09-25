/* الحقول: نص واختيار ونص طويل، بتسمية فوقها وشرح تحتها. */

import React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className, id, ...props }: InputProps) {
  const inputId = id || label?.replace(/\s/g, "-").toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
          {label}
          {props.required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-inner shadow-slate-900/[0.015]",
          "hover:border-slate-300 focus:bg-white focus:border-[#1C2D50] focus:ring-4 focus:ring-[#EEF1F7] focus:outline-none",
          "transition-all duration-150",
          error && "border-red-400 focus:border-red-400 focus:ring-red-100",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  placeholder?: string;
}

export function Select({ label, error, placeholder, className, id, children, ...props }: SelectProps) {
  const selectId = id || label?.replace(/\s/g, "-").toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-semibold text-slate-700">
          {label}
          {props.required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          "w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-800 shadow-inner shadow-slate-900/[0.015]",
          "hover:border-slate-300 focus:bg-white focus:border-[#1C2D50] focus:ring-4 focus:ring-[#EEF1F7] focus:outline-none",
          "transition-all duration-150",
          error && "border-red-400 focus:border-red-400 focus:ring-red-100",
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id || label?.replace(/\s/g, "-").toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-semibold text-slate-700">
          {label}
          {props.required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 resize-none shadow-inner shadow-slate-900/[0.015]",
          "hover:border-slate-300 focus:bg-white focus:border-[#1C2D50] focus:ring-4 focus:ring-[#EEF1F7] focus:outline-none",
          "transition-all duration-150",
          error && "border-red-400",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
