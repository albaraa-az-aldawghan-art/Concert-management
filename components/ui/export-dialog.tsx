"use client";

/* نافذة التصدير إلى إكسل: اختيار السنة والأعمدة، ثم تنزيل الملف أو نسخ
   رابط دائم يُحدَّث تلقائياً من داخل إكسل. */

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { ExportColumn } from "@/lib/server/export-columns";
import {
  FileSpreadsheet, Download, Link2, Check, Copy, ShieldAlert, Loader2, RefreshCw,
} from "lucide-react";

interface KeyInfo {
  id: string; label: string; createdAt: number; lastUsedAt: number | null;
  useCount: number; revoked: boolean;
}

export function ExportDialog({
  open,
  onClose,
  kind,
  columns,
  title,
}: {
  open: boolean;
  onClose: () => void;
  /** مسار الـAPI: sales أو costs */
  kind: "sales" | "costs";
  columns: ExportColumn[];
  title: string;
}) {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);

  /* الاختيار يُحفظ في المتصفح: من صدّر بأعمدة معيّنة يريدها المرة القادمة */
  const storeKey = `export-cols-${kind}`;
  useEffect(() => {
    if (!open) return;
    const saved = typeof window !== "undefined" ? localStorage.getItem(storeKey) : null;
    const savedList = saved ? saved.split(",").filter((k) => columns.some((c) => c.key === k)) : [];
    setPicked(savedList.length ? savedList : columns.filter((c) => c.default).map((c) => c.key));
    setLinkKey(null);
    setYear(thisYear);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = thisYear + 1; y >= thisYear - 5; y--) list.push(y);
    return list;
  }, [thisYear]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      // عمود واحد على الأقل — ملف بلا أعمدة لا معنى له
      if (next.length === 0) return prev;
      localStorage.setItem(storeKey, next.join(","));
      return next;
    });
  }

  function setAll(all: boolean) {
    const next = all ? columns.map((c) => c.key) : columns.filter((c) => c.default).map((c) => c.key);
    setPicked(next);
    localStorage.setItem(storeKey, next.join(","));
  }

  const query = `year=${year}&cols=${picked.join(",")}`;

  /* التنزيل يمرّ برمز الجلسة، فلا يحتاج مفتاحاً */
  async function download() {
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
      const res = await fetch(`/api/export/${kind}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذّر التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind === "sales" ? "المبيعات" : "التكاليف"}-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("نُزّل الملف");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر التصدير", "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const res = await api.get<{ keys: KeyInfo[] }>("/api/export/keys");
      setKeys(res.keys ?? []);
    } catch {
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  }

  async function createKey() {
    setBusy(true);
    try {
      const res = await api.post<{ id: string; key: string }>("/api/export/keys", {
        label: `${kind === "sales" ? "المبيعات" : "التكاليف"} ${year}`,
      });
      setLinkKey(res.key);
      loadKeys();
      showToast("أُنشئ الرابط — انسخه الآن، لن يظهر مرة أخرى");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر الإنشاء", "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.del(`/api/export/keys/${id}`);
      showToast("أُبطل الرابط");
      loadKeys();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذّر الإبطال", "error");
    }
  }

  const permanentUrl =
    linkKey && typeof window !== "undefined"
      ? `${window.location.origin}/api/export/${kind}?${query}&key=${linkKey}`
      : "";

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => showToast("نُسخ الرابط"),
      () => showToast("تعذّر النسخ — انسخه يدوياً", "error")
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="space-y-4">
        {/* السنة */}
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">السنة</label>
          <div className="flex gap-2 flex-wrap">
            {years.map((y) => (
              <button key={y} type="button" onClick={() => setYear(y)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold tabular-nums-auto transition-colors ${
                  year === y ? "bg-[#1C2D50] text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}>
                {y}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            ملف واحد لكل سنة: اثنتا عشرة ورقة شهرية وورقة ملخص في آخره.
          </p>
        </div>

        {/* الأعمدة */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700">
              الأعمدة <span className="text-xs font-normal text-slate-400">({picked.length} من {columns.length})</span>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAll(true)}
                className="text-[11px] font-semibold text-[#1C2D50] hover:underline">تحديد الكل</button>
              <span className="text-slate-300">·</span>
              <button type="button" onClick={() => setAll(false)}
                className="text-[11px] font-semibold text-slate-500 hover:underline">الافتراضي</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-2">
            {columns.map((c) => {
              const on = picked.includes(c.key);
              return (
                <button key={c.key} type="button" onClick={() => toggle(c.key)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-right transition-colors ${
                    on ? "bg-[#EEF1F7] text-[#1C2D50] font-semibold" : "text-slate-600 hover:bg-slate-50"
                  }`}>
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    on ? "bg-[#1C2D50] border-[#1C2D50]" : "border-slate-300"
                  }`}>
                    {on && <Check size={11} className="text-white" />}
                  </span>
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* التنزيل */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={download} loading={busy} className="flex-1 justify-center">
            <Download size={15} /> تنزيل ملف {year}
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={createKey} disabled={busy} className="flex-1 justify-center">
              <Link2 size={15} /> إنشاء رابط دائم
            </Button>
          )}
        </div>

        {/* الرابط الدائم */}
        {permanentUrl && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <Link2 size={13} /> الرابط الدائم — انسخه الآن، لن يظهر مرة أخرى
            </p>
            <div className="flex gap-2">
              <input readOnly value={permanentUrl} dir="ltr"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-[11px] font-mono bg-white border border-emerald-200 rounded-lg px-2 py-1.5" />
              <Button size="sm" variant="success" onClick={() => copy(permanentUrl)}>
                <Copy size={13} /> نسخ
              </Button>
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              في إكسل: <strong>البيانات ← من الويب</strong> ← الصق الرابط. بعدها يكفي زر <strong>تحديث</strong>
              ليأتي أحدث ما في الموقع بلا إعادة تنزيل.
            </p>
            <p className="text-[11px] text-red-700 flex items-start gap-1.5">
              <ShieldAlert size={13} className="shrink-0 mt-0.5" />
              من يملك هذا الرابط يستطيع قراءة البيانات بلا تسجيل دخول — لا تشاركه إلا مع من تثق به، وأبطله متى شئت.
            </p>
          </div>
        )}

        {/* الروابط القائمة */}
        {isAdmin && (
          <div>
            <button type="button" onClick={loadKeys}
              className="text-xs font-semibold text-slate-500 hover:text-[#1C2D50] flex items-center gap-1.5">
              {loadingKeys ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              عرض الروابط الدائمة القائمة
            </button>
            {keys.length > 0 && (
              <div className="mt-2 space-y-1">
                {keys.map((k) => (
                  <div key={k.id}
                    className={`flex items-center gap-2 text-[11px] border rounded-lg px-2.5 py-1.5 ${
                      k.revoked ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200"
                    }`}>
                    <FileSpreadsheet size={12} className="shrink-0" />
                    <span className="flex-1 truncate">{k.label}</span>
                    <span className="tabular-nums-auto text-slate-400 shrink-0">
                      {k.useCount > 0 ? `استُعمل ${k.useCount.toLocaleString("en-US")} مرة` : "لم يُستعمل"}
                    </span>
                    {k.revoked ? (
                      <span className="text-slate-400 shrink-0">مُبطَل</span>
                    ) : (
                      <button onClick={() => revoke(k.id)} className="text-red-500 hover:underline shrink-0">إبطال</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
