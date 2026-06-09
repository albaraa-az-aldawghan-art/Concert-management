"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getConcerts, deleteConcert } from "@/lib/firestore/concerts";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/modal";
import { Concert } from "@/types";
import { formatDate } from "@/lib/utils";
import { Plus, Music, MapPin, Calendar, Trash2, Eye } from "lucide-react";

export default function AdminConcertsPage() {
  const { showToast } = useToast();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Concert | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => { loadConcerts(); }, []);

  async function loadConcerts() {
    setLoading(true);
    const data = await getConcerts();
    setConcerts(data);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteConcert(deleteTarget.id);
      showToast("تم حذف الحفلة");
      setDeleteTarget(null);
      loadConcerts();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  const filtered = filterStatus ? concerts.filter((c) => c.status === filterStatus) : concerts;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">الحفلات</h2>
          <p className="text-sm text-slate-500">{concerts.length} حفلة مسجلة</p>
        </div>
        <Link href="/admin/concerts/new">
          <Button>
            <Plus size={16} />
            حفلة جديدة
          </Button>
        </Link>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "planned", "active", "completed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s
                ? "bg-blue-700 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {s === "" ? "الكل" : s === "planned" ? "مخططة" : s === "active" ? "جارية" : "منتهية"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Music size={40} className="mb-3 opacity-40" />
          <p>لا توجد حفلات</p>
          <Link href="/admin/concerts/new" className="mt-3">
            <Button size="sm">إنشاء أول حفلة</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((concert) => (
            <Card key={concert.id} className="relative hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 truncate">{concert.name}</h3>
                  <StatusBadge status={concert.status} />
                </div>
                <div className="flex gap-1 mr-2">
                  <Link
                    href={`/admin/concerts/${concert.id}`}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye size={15} />
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(concert)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="shrink-0" />
                  <span>{formatDate(concert.date)}</span>
                </div>
                {concert.location?.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{concert.location.address}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-3 text-xs text-slate-500">
                <span>{concert.supervisorIds.length} مشرف</span>
                <span>{concert.employeeIds.length} موظف</span>
                <span className={concert.deliveryApproved ? "text-green-600" : ""}>
                  {concert.deliveryApproved ? "✓ تم قبول التسليم" : "⏳ في انتظار قبول التسليم"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الحفلة"
        message={`هل أنت متأكد من حذف حفلة "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
