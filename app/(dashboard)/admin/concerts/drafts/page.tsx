"use client";

/* مسودات الحفلات: كل حفلة بدأ إدخالها ولم تُكمَل بعد، لتُستأنف متى شاء صاحبها أو أي زميل. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getConcertDrafts, deleteConcertDraft } from "@/lib/firestore/concert-drafts";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { ConcertDraft } from "@/types";
import { FileEdit, Trash2, Phone, CalendarDays, User } from "lucide-react";

function fmtWhen(ts: ConcertDraft["updatedAt"]): string {
  const d = ts.toDate();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} — ${hh}:${min}`;
}

export default function ConcertDraftsPage() {
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const blocked = appUser?.role === "custom" && !feat("concerts", "create");

  const [drafts, setDrafts] = useState<ConcertDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ConcertDraft | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setDrafts(await getConcertDrafts());
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteConcertDraft(deleteTarget.id);
      showToast("حُذفت المسودة");
      setDeleteTarget(null);
      load();
    } catch {
      showToast("تعذّر الحذف", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (blocked) {
    return (
      <p className="text-center text-slate-400 py-12">
        صلاحيتك على الحفلات «عرض فقط» — لا يمكنك الوصول إلى المسودات
      </p>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">مسودات الحفلات</h2>
          <p className="text-sm text-slate-500">{drafts.length} مسودة محفوظة</p>
        </div>
        <Link href="/admin/concerts/new">
          <Button variant="secondary">حفلة جديدة</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : drafts.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <FileEdit size={40} className="mb-3 opacity-40" />
          <p>لا توجد مسودات محفوظة</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 text-base truncate">
                    {d.form.clientName.trim() || "بلا اسم عميل بعد"}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                    {d.form.clientPhone && (
                      <span className="flex items-center gap-1"><Phone size={12} />{d.form.clientPhone}</span>
                    )}
                    {d.form.date && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} />
                        {new Date(d.form.date).toLocaleDateString("ar-SA-u-nu-latn")}
                      </span>
                    )}
                    <span className="flex items-center gap-1"><User size={12} />{d.createdByName || "—"}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">آخر تعديل {fmtWhen(d.updatedAt)}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Link href={`/admin/concerts/new?draft=${d.id}`}>
                    <Button size="sm">متابعة</Button>
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(d)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label="حذف المسودة"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المسودة"
        message={`هل أنت متأكد من حذف مسودة "${deleteTarget?.form.clientName.trim() || "بلا اسم"}"؟`}
        confirmLabel="حذف"
        loading={deleting}
      />
    </div>
  );
}
