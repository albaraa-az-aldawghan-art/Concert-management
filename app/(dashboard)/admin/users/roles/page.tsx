"use client";

/* الأدوار: القائمة. كل دور بطاقة تُظهر ما يفتحه وكم صلاحية يملك،
   وتفتح صفحة تحريره الكاملة — لا نافذة منبثقة. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getCustomRoles, addCustomRole, deleteCustomRole } from "@/lib/firestore/roles";
import { getAllUsers } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, CustomRole } from "@/types";
import {
  PERMISSION_CATALOG, normalizedFeatures, roleDocIdFor, TOTAL_PERMISSIONS,
} from "@/lib/permissions";
import {
  ChevronRight, ChevronLeft, Plus, Shield, ShieldCheck, Lock, Trash2, Users, AlertTriangle,
} from "lucide-react";

export default function RolesPage() {
  const router = useRouter();
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const canCreate = isAdmin || feat("users", "roles_create");
  const canDelete = isAdmin || feat("users", "roles_delete");

  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [r, u] = await Promise.all([getCustomRoles().catch(() => []), getAllUsers().catch(() => [])]);
    setRoles(r);
    setUsers(u);
    setLoading(false);
  }

  /* من يحمل كل دور — يمنع حذف دور مستعمَل ويُظهر أثر أي تعديل */
  const holders = useMemo(() => {
    const m = new Map<string, AppUser[]>();
    for (const u of users) {
      if (u.role === "admin") continue;
      const id = roleDocIdFor(u);
      if (!id) continue;
      m.set(id, [...(m.get(id) ?? []), u]);
    }
    return m;
  }, [users]);

  /* عدّ الصلاحيات الممنوحة لكل دور، وأسماء الصفحات التي يفتحها */
  function summarize(role: CustomRole) {
    let granted = 0;
    const pages: string[] = [];
    for (const p of PERMISSION_CATALOG) {
      const f = normalizedFeatures(role, p.key);
      if (f === null) continue;
      pages.push(p.label);
      granted += f.length;
    }
    return { granted, pages };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !newName.trim()) return;
    setSaving(true);
    try {
      /* الدور يُنشأ فارغاً ثم تُضبط صلاحياته في صفحته — أوضح من
         نافذة تطلب الاسم والصلاحيات معاً في شاشة واحدة مزدحمة */
      const created = await addCustomRole({
        name: newName.trim(), permissions: {}, createdBy: appUser.uid,
      });
      showToast("أُنشئ الدور — حدّد صلاحياته الآن");
      router.push(`/admin/users/roles/${created.id}`);
    } catch {
      showToast("حدث خطأ أثناء الإنشاء", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCustomRole(deleteTarget.id);
      showToast("حُذف الدور");
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setSaving(false);
    }
  }

  const builtIn = roles.filter((r) => r.builtIn);
  const custom = roles.filter((r) => !r.builtIn);

  function RoleCard({ role }: { role: CustomRole }) {
    const { granted, pages } = summarize(role);
    const who = holders.get(role.id) ?? [];
    const empty = granted === 0 && pages.length === 0;
    return (
      <Card className="relative">
        <Link href={`/admin/users/roles/${role.id}`} className="absolute inset-0 rounded-2xl" aria-label={`تعديل ${role.name}`} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pointer-events-none">
            <div className="flex items-center gap-2">
              {role.builtIn ? <ShieldCheck size={16} className="text-[#1C2D50] shrink-0" />
                            : <Shield size={16} className="text-[#1C2D50] shrink-0" />}
              <h3 className="font-bold text-slate-800">{role.name}</h3>
              {role.builtIn && (
                <span className="text-[10px] bg-[#EEF1F7] text-[#1C2D50] px-2 py-0.5 rounded-full font-semibold">
                  جاهز
                </span>
              )}
            </div>
            {role.hint && <p className="text-xs text-slate-400 mt-1 pe-6">{role.hint}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0 relative">
            {canDelete && !role.builtIn && (
              <button
                onClick={() => setDeleteTarget(role)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="حذف الدور"
              >
                <Trash2 size={14} />
              </button>
            )}
            <ChevronLeft size={16} className="text-slate-300" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs pointer-events-none">
          <span className="text-slate-500">
            <span className="font-bold text-[#1C2D50] tabular-nums">{granted}</span> من {TOTAL_PERMISSIONS} صلاحية
          </span>
          <span className="text-slate-500">
            <span className="font-bold text-[#1C2D50] tabular-nums">{pages.length}</span> صفحة
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Users size={12} className="text-slate-300" />
            <span className="font-bold text-[#1C2D50] tabular-nums">{who.length}</span> موظف
          </span>
        </div>

        {empty ? (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2 pointer-events-none">
            <AlertTriangle size={13} className="shrink-0" />
            لا يفتح أي صفحة — من يحمله يسجّل دخوله ولا يرى شيئاً
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-3 pointer-events-none">
            {pages.slice(0, 8).map((p) => (
              <span key={p} className="text-[11px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full">{p}</span>
            ))}
            {pages.length > 8 && (
              <span className="text-[11px] text-slate-400">+{pages.length - 8}</span>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#1C2D50] transition-colors"
      >
        <ChevronRight size={16} />
        الموظفون
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">الأدوار والصلاحيات</h2>
          <p className="text-sm text-slate-500">
            {roles.length} دور · {TOTAL_PERMISSIONS} صلاحية مفردة في النظام
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setNewName(""); setShowAdd(true); }} className="gap-2">
            <Plus size={16} /> دور جديد
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-slate-300" />
              <h3 className="text-sm font-bold text-slate-600">أدوار جاهزة</h3>
              <span className="text-xs text-slate-400">تأتي مع النظام — تُعدَّل صلاحياتها ولا تُحذف</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {builtIn.map((r) => <RoleCard key={r.id} role={r} />)}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-slate-300" />
              <h3 className="text-sm font-bold text-slate-600">أدوار مخصّصة</h3>
            </div>
            {custom.length === 0 ? (
              <Card className="text-center py-8 text-sm text-slate-400">
                لا أدوار مخصّصة بعد — أنشئ دوراً وحدّد صلاحياته بالتفصيل
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {custom.map((r) => <RoleCard key={r.id} role={r} />)}
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="دور جديد">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="اسم الدور"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: محاسب، مدير حفلات، مشرف موارد..."
            required
            helperText="يُنشأ بلا صلاحيات، ثم تحدّدها في صفحته"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button type="submit" loading={saving} disabled={!newName.trim()}>إنشاء ومتابعة</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الدور"
        message={`هل أنت متأكد من حذف الدور "${deleteTarget?.name}"؟ لن يُحذف إذا كان مرتبطاً بموظفين.`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
