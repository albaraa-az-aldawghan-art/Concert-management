"use client";

import type { Dispatch, SetStateAction } from "react";
import { Download, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { searchExportCustomers, type ExportCustomerChoice } from "@/lib/customer-export-search";

export function CustomerExportDialog({ open, onClose, customers, currentCustomerId, selectedIds, setSelectedIds, search, setSearch, exporting, onExport }: {
  open: boolean; onClose: () => void; customers: ExportCustomerChoice[]; currentCustomerId?: string;
  selectedIds: string[]; setSelectedIds: Dispatch<SetStateAction<string[]>>;
  search: string; setSearch: (value: string) => void; exporting: boolean; onExport: () => void;
}) {
  const results = searchExportCustomers(customers, search);
  const hiddenCount = selectedIds.filter(id => !results.some(customer => customer.id === id)).length;
  return <Modal open={open} onClose={onClose} confirmClose={!exporting} title="كشف حساب العملاء إلى PDF" size="lg">
    <p className="mb-3 text-sm text-slate-500">اختر عميلاً أو أكثر. يشمل الكشف جميع حفلاتهم ودفعاتها المطابقة لفلاتر الصفحة، وليس الصفحة الحالية فقط. نطاق التاريخ حسب تاريخ الحفلة.</p>
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">بحث عن العملاء</span>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#1C2D50] focus-within:ring-2 focus-within:ring-slate-100">
        <Search size={17} className="shrink-0 text-slate-400" />
        <input aria-label="بحث عن العملاء في التصدير" value={search} disabled={exporting} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم العميل أو رقم الجوال..." className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {search && <button type="button" disabled={exporting} onClick={() => setSearch("")} aria-label="مسح بحث التصدير" className="text-xs font-semibold text-slate-500">مسح</button>}
      </div>
    </label>
    <div className="mb-3 flex flex-wrap gap-2">
      <Button variant="outline" disabled={exporting || !results.length} onClick={() => setSelectedIds(results.map(customer => customer.id))}>{search.trim() ? "تحديد نتائج البحث فقط" : "تحديد الكل"}</Button>
      <Button variant="outline" disabled={exporting || !currentCustomerId} onClick={() => setSelectedIds(currentCustomerId ? [currentCustomerId] : [])}>العميل المفتوح فقط</Button>
      <Button variant="outline" disabled={exporting} onClick={() => setSelectedIds([])}>إلغاء التحديد</Button>
    </div>
    <div className="mb-2 flex flex-wrap justify-between gap-1 text-xs text-slate-500" aria-live="polite"><span>{results.length} نتيجة من {customers.length} عميل</span><span>{selectedIds.length} عميل محدد{hiddenCount ? ` · ${hiddenCount} خارج نتائج البحث` : ""}</span></div>
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
      {results.map(customer => <label key={customer.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
        <input type="checkbox" disabled={exporting} checked={selectedIds.includes(customer.id)} onChange={event => {
          const checked = event.target.checked;
          setSelectedIds(ids => checked ? [...new Set([...ids, customer.id])] : ids.filter(id => id !== customer.id));
        }} />
        <span className="min-w-0 flex-1 break-words text-sm">{customer.name}</span><span className="shrink-0 text-xs text-slate-500" dir="ltr">{customer.primaryPhone}</span>
      </label>)}
      {!results.length && <p className="p-6 text-center text-sm text-slate-400">لا توجد أسماء أو أرقام مطابقة للبحث</p>}
    </div>
    <p className="mt-2 text-xs text-slate-400">البحث لا يلغي اختياراتك. سيُصدّر الكشف لكل العملاء المحددين، بما فيهم المحددون خارج نتائج البحث.</p>
    <div className="mt-4"><Button onClick={onExport} loading={exporting} disabled={!selectedIds.length}><Download size={16} /> تنزيل كشف الحساب ({selectedIds.length} عميل)</Button></div>
  </Modal>;
}
