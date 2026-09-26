"use client";

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { auth } from "@/lib/firebase";
import { ExportColumn } from "@/lib/server/export-columns";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Scope = "raw" | "products" | "recipes";

export function CostItemsExportDialog({
  open, onClose, scope, columns, title, filename,
}: {
  open: boolean;
  onClose: () => void;
  scope: Scope;
  columns: ExportColumn[];
  title: string;
  filename: string;
}) {
  const { showToast } = useToast();
  const storeKey = `export-cols-cost-items-${scope}`;
  const [picked, setPicked] = useState<string[]>(() => {
    const saved = typeof window === "undefined" ? [] : localStorage.getItem(storeKey)?.split(",").filter((key) => columns.some((column) => column.key === key)) ?? [];
    return saved.length ? saved : columns.filter((column) => column.default).map((column) => column.key);
  });
  const [busy, setBusy] = useState(false);

  function save(next: string[]) {
    setPicked(next);
    localStorage.setItem(storeKey, next.join(","));
  }

  function toggle(key: string) {
    const next = picked.includes(key) ? picked.filter((item) => item !== key) : [...picked, key];
    if (next.length) save(next);
  }

  async function download() {
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const params = new URLSearchParams({ scope, cols: picked.join(",") });
      const response = await fetch(`/api/export/cost-items?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error ?? "تعذّر التصدير");
      }
      const blob = await response.blob();
      if (blob.size < 1000) throw new Error("ملف التصدير غير مكتمل — حاول مرة أخرى");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("تم تنزيل ملف الإكسل");
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذّر التصدير", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-700">
              اختر الأعمدة <span className="text-xs font-normal text-slate-400">({picked.length} من {columns.length})</span>
            </label>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <button type="button" onClick={() => save(columns.map((column) => column.key))} className="text-[#1C2D50] hover:underline">تحديد الكل</button>
              <span className="text-slate-300">·</span>
              <button type="button" onClick={() => save(columns.filter((column) => column.default).map((column) => column.key))} className="text-slate-500 hover:underline">الافتراضي</button>
            </div>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-3">
            {columns.map((column) => {
              const selected = picked.includes(column.key);
              return (
                <button key={column.key} type="button" onClick={() => toggle(column.key)}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs transition-colors ${selected ? "bg-[#EEF1F7] font-semibold text-[#1C2D50]" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${selected ? "border-[#1C2D50] bg-[#1C2D50]" : "border-slate-300"}`}>
                    {selected && <Check size={11} className="text-white" />}
                  </span>
                  <span className="truncate">{column.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={download} loading={busy} disabled={!picked.length} className="w-full justify-center">
          <Download size={15} /> تنزيل الملف
        </Button>
      </div>
    </Modal>
  );
}
