"use client";

import React, { useEffect, useRef, useState } from "react";
import { toLatinDigits } from "@/lib/utils";
import { latinFieldValue, numericFieldError, validCalendarValue } from "@/lib/latin-fields";

/** Text rendering is intentional: native number/date widgets can localize digits. */
export function LatinInput({ type = "text", value, defaultValue, onChange, onBlur, onFocus, className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const numeric = type === "number";
  const calendar = type === "date" || type === "month" || type === "datetime-local";
  const temporal = calendar || type === "time";
  const calendarType = type === "month" ? "month" : type === "datetime-local" ? "datetime-local" : type === "time" ? "time" : "date";
  const input = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const formatted = value == null ? toLatinDigits(String(defaultValue ?? "")) : toLatinDigits(String(value));
  const [edit, setEdit] = useState({ source: formatted, text: formatted });
  const draft = edit.source === formatted ? edit.text : formatted;
  const [view, setView] = useState(() => formatted.slice(0, 7) || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7));

  useEffect(() => {
    if (numeric && input.current) input.current.setCustomValidity(numericFieldError(input.current.value, props.min, props.max, props.step));
  }, [numeric, formatted, props.min, props.max, props.step]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(next: string, close = true) {
    if (!input.current) return;
    setEdit({ source: formatted, text: next });
    input.current.value = next;
    const valid = validCalendarValue(next, calendarType, props.min, props.max);
    input.current.setCustomValidity(valid ? "" : "أدخل تاريخاً ووقتاً صحيحين ضمن النطاق المحدد");
    if (!valid) return;
    onChange?.({ target: input.current, currentTarget: input.current } as React.ChangeEvent<HTMLInputElement>);
    if (close) { setOpen(false); input.current.focus(); }
  }

  const field = <input {...props} ref={input} type={numeric || temporal ? "text" : type}
    value={temporal ? draft : value == null ? value : formatted}
    defaultValue={defaultValue == null ? defaultValue : toLatinDigits(String(defaultValue))}
    lang={numeric || temporal ? "en-GB" : props.lang} dir={numeric || temporal ? "ltr" : props.dir}
    inputMode={numeric ? props.inputMode || "decimal" : temporal ? "text" : props.inputMode}
    data-latin-field={numeric ? "number" : temporal ? type : undefined}
    placeholder={props.placeholder || (temporal ? type === "date" ? "YYYY-MM-DD" : type === "month" ? "YYYY-MM" : type === "time" ? "HH:mm" : "YYYY-MM-DDTHH:mm" : undefined)}
    className={`${className || ""}${calendar ? " pr-10" : ""}`}
    onFocus={onFocus}
    onChange={(event) => {
      if (numeric) {
        event.target.value = latinFieldValue(event.target.value);
        event.target.setCustomValidity(numericFieldError(event.target.value, props.min, props.max, props.step));
      }
      if (temporal) {
        const next = toLatinDigits(event.target.value);
        event.target.value = next;
        setEdit({ source: formatted, text: next });
        const valid = validCalendarValue(next, calendarType, props.min, props.max);
        event.target.setCustomValidity(valid ? "" : "أدخل تاريخاً صحيحاً ضمن النطاق المحدد");
        if (!valid) return;
      }
      onChange?.(event);
    }}
    onBlur={(event) => { onBlur?.(event); }}
    onKeyDown={(event) => {
      props.onKeyDown?.(event);
      if (calendar && event.key === "Escape") setOpen(false);
      if (calendar && event.altKey && event.key === "ArrowDown") { event.preventDefault(); setView(formatted.slice(0, 7) || view); setOpen(true); }
    }} />;
  if (!calendar) return field;

  const year = Number(view.slice(0, 4)) || new Date().getFullYear();
  const month = Number(view.slice(5, 7)) || new Date().getMonth() + 1;
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const navigate = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setView(next.toISOString().slice(0, 7));
  };
  return <div ref={wrapper} className="relative min-w-0">
    {field}
    <button type="button" aria-label="فتح التقويم" aria-expanded={open} disabled={props.disabled || props.readOnly}
      onClick={() => { setView(formatted.slice(0, 7) || view); setOpen(!open); }}
      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 disabled:opacity-40">▦</button>
    {open && <div role="dialog" aria-label="اختيار التاريخ" dir="rtl" className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label={type === "month" ? "السنة السابقة" : "الشهر السابق"} onClick={() => navigate(type === "month" ? -12 : -1)}>‹</button>
        <span>{monthNames[month - 1]} <b dir="ltr">{year}</b></span>
        <button type="button" aria-label={type === "month" ? "السنة التالية" : "الشهر التالي"} onClick={() => navigate(type === "month" ? 12 : 1)}>›</button>
      </div>
      <div className={`grid gap-1 ${type === "month" ? "grid-cols-3" : "grid-cols-7"}`}>
        {type !== "month" && ["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"].map((day) => <span key={day} className="py-1 text-center text-xs text-slate-400">{day}</span>)}
        {type !== "month" && Array.from({ length: new Date(Date.UTC(year, month - 1, 1)).getUTCDay() }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length: type === "month" ? 12 : new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => {
          const day = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const next = type === "month" ? `${year}-${String(i + 1).padStart(2, "0")}` : type === "datetime-local" ? `${day}T${draft.split("T")[1] || "00:00"}` : day;
          return <button type="button" key={next} disabled={!validCalendarValue(next, calendarType, props.min, props.max)}
            aria-label={next} aria-pressed={formatted === next} onClick={() => choose(next, type !== "datetime-local")}
            className={`rounded-lg py-2 text-center disabled:opacity-25 ${formatted === next ? "bg-[#1C2D50] text-white" : "hover:bg-slate-100"}`}>{type === "month" ? monthNames[i] : i + 1}</button>;
        })}
      </div>
      {type === "datetime-local" && <label className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
        <span>الوقت</span>
        <input type="text" dir="ltr" lang="en-GB" data-latin-field="time" aria-label="وقت الحفلة HH:mm"
          disabled={!validCalendarValue(draft.slice(0, 10), "date") || !draft}
          value={draft.split("T")[1] || "00:00"} placeholder="HH:mm" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2"
          onChange={e => choose(`${draft.slice(0, 10) || `${view}-01`}T${toLatinDigits(e.target.value)}`, false)} />
      </label>}
    </div>}
  </div>;
}
