"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { downloadBlob } from "@/lib/download-file";
import { Modal } from "./modal";
import { Button } from "./button";
import { LatinInput } from "./latin-input";

export function ExpensesExportDialog({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function download() {
    if (busy) return;
    if (from && to && from > to) { setError("تاريخ البداية يجب أن يسبق النهاية"); return; }
    setBusy(true); setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("أعد تسجيل الدخول");
      const response = await fetch("/api/export/expenses", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ filters: { from, to } }) });
      if (!response.ok) throw new Error((await response.json()).error || "تعذر التصدير");
      if (!response.headers.get("Content-Type")?.includes("spreadsheetml")) throw new Error("رد التنزيل ليس ملف Excel؛ أعد المحاولة");
      downloadBlob(await response.blob(), "جميع-المصاريف.xlsx");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر التصدير"); }
    finally { setBusy(false); }
  }
  return <Modal open title="تصدير جميع المصاريف إلى Excel" onClose={() => { if (!busy) onClose(); }} confirmClose size="xl">
    <div className="space-y-5">
      <p className="text-sm leading-7 text-slate-600">ملف واحد يحتوي ملخصًا وجميع فواتير مصروفات الحفلات والمصاريف اليومية للتعاقدات، عبر جميع الصفحات. تُفصل الخصومات عن الصرف الفعلي. اترك التاريخين فارغين لتصدير كامل السجل.</p>
      <div className="rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">المصاريف العامة والمطعم لا تملك سجلًا مستقلًا حاليًا. لا يشمل هذا التقرير التكاليف التقديرية أو شراء وصرف المخزون، ولا يفترض سداد الفواتير أو ضريبة غير موثقة.</div>
      <p className="text-xs text-slate-500">فترة مستقلة حسب تاريخ فاتورة المصروف / يوم تشغيل العقد، وليست تاريخ الحفلة أو إنشائها.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">من تاريخ<LatinInput type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={busy} className="mt-2 w-full rounded-xl border p-3" /></label>
        <label className="space-y-2 text-sm">إلى تاريخ<LatinInput type="date" value={to} onChange={e => setTo(e.target.value)} disabled={busy} className="mt-2 w-full rounded-xl border p-3" /></label>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button onClick={download} disabled={busy}>{busy ? "جارٍ إنشاء الملف…" : "تنزيل ملف جميع المصاريف"}</Button>
    </div>
  </Modal>;
}
