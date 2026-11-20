"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { materialSearchKey, type MaterialChoice } from "@/lib/material-requests";

/** Search and select in one field. A typed name is never treated as a selected ID. */
export function MaterialChoicePicker({ items, value, onChange, disabled = false }: {
  items: MaterialChoice[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId(), listId = `${id}-options`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = items.find(item => item.id === value);
  const matches = items.filter(item => materialSearchKey(`${item.name} ${item.id}`).includes(materialSearchKey(query)));
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const visible = open && !disabled;
  useEffect(() => {
    if (visible) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [visible, activeIndex, listId]);
  function choose(item: MaterialChoice) {
    onChange(item.id); setQuery(""); setOpen(false);
  }
  return <div className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">بحث واختيار مادة</label>
    <div className="relative">
      <Search size={17} className="pointer-events-none absolute right-3 top-3.5 text-slate-400"/>
      <input ref={inputRef} id={id} role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={visible && matches.length ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off" disabled={disabled} value={visible ? query : selected?.name ?? ""}
        placeholder={disabled ? "جارٍ تحميل المواد…" : "ابحث باسم المادة أو الباركود، أو اختر من القائمة"}
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1C2D50] focus:bg-white focus:ring-4 focus:ring-[#EEF1F7] disabled:opacity-60"
        onFocus={() => { setQuery(""); setActive(0); setOpen(true); }}
        onClick={() => { if (!open) { setQuery(""); setActive(0); setOpen(true); } }}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); onChange(""); }}
        onKeyDown={event => {
          if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!visible) { setQuery(""); setActive(0); setOpen(true); }
            else setActive(event.key === "ArrowDown" ? Math.max(0, Math.min(activeIndex + 1, matches.length - 1)) : Math.max(0, activeIndex - 1));
          }
          if (event.key === "Enter") { event.preventDefault(); if (visible && matches[activeIndex]) choose(matches[activeIndex]); }
        }}/>
      <ChevronDown size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-400"/>
    </div>
    {visible && <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <ul id={listId} role="listbox" aria-label="المواد الخام" className="max-h-56 overflow-y-auto overscroll-contain py-1">
        {matches.map((item, index) => <li key={item.id} role="presentation"><button type="button" role="option" tabIndex={-1}
          id={`${listId}-${index}`} aria-selected={value === item.id}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}
          className={`w-full px-3 py-2.5 text-right text-sm ${index === activeIndex ? "bg-[#EEF1F7]" : "hover:bg-slate-50"}`}>
          <span className="block break-words font-semibold text-[#1C2D50]">{item.name}</span>
          <span className="mt-0.5 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span dir="ltr">{item.id}</span><span>الرصيد: {item.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })} {item.unit}</span></span>
        </button></li>)}
        {!matches.length && <li role="presentation" className="p-4 text-center text-sm text-slate-500">{query ? "لا توجد مواد مطابقة للبحث" : "لا توجد مواد متاحة للإضافة"}</li>}
      </ul>
    </div>}
  </div>;
}
