"use client";

/* ملف الموظف: مسار خاص لكل موظف تحت /admin/users/<uid>.
   صلاحيته هي صلاحية صفحة الموظفين نفسها — pageKeyFromPath يردّ "users"
   لكل ما يبدأ بـ /admin/users، فلا تنشأ قاعدة وصول ثانية. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firestore/users";
import { getCustomRoles } from "@/lib/firestore/roles";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, CustomRole } from "@/types";
import { getRoleLabel, formatDate } from "@/lib/utils";
import { ChevronRight, Pencil, Trash2, Mail, CalendarDays, Shield, ShieldCheck, Lock } from "lucide-react";

/* الأدوار التي يجوز إسنادها — «أدمن» ليس منها عمداً */
const assignable = [
  { value: "warehouse_manager", label: "مدير الموارد" },
  { value: "supervisor",        label: "مشرف" },
  { value: "employee",          label: "موظف" },
  { value: "kitchen",           label: "مطبخ" },
];

export default function StaffProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canEdit = feat("users", "edit");
  const canDelete = feat("users", "delete");

  const [user, setUser] = useState<AppUser | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({ name: "", newPassword: "", role: "" });

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  async function load() {
    setLoading(true);
    const [users, roles] = await Promise.all([getAllUsers(), getCustomRoles().catch(() => [])]);
    setUser(users.find((u) => u.uid === uid) ?? null);
    setCustomRoles(roles);
    setLoading(false);
  }

  const roleValueOf = (u: AppUser) =>
    u.role === "custom" && u.customRoleId ? `custom::${u.customRoleId}` : u.role;

  const currentRole = user?.role === "custom" ? customRoles.find((r) => r.id === user.customRoleId) ?? null : null;
  const roleName = user
    ? user.role === "custom"
      ? currentRole?.name ?? "دور محذوف"
      : getRoleLabel(user.role)
    : "";

  function openEdit() {
    if (!user) return;
    setForm({ name: user.name, newPassword: "", role: roleValueOf(user) });
    setShowEdit(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimName = form.name.trim();
    const trimPass = form.newPassword.trim();
    if (!trimName) { showToast("الاسم مطلوب", "error"); return; }
    if (trimPass && trimPass.length < 6) {
      showToast("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "error");
      return;
    }

    const roleChanged = form.role !== roleValueOf(user);
    const isCustom = form.role.startsWith("custom::");

    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: user.uid,
          newName: trimName !== user.name ? trimName : undefined,
          newPassword: trimPass || undefined,
          newRole: roleChanged ? (isCustom ? "custom" : form.role) : undefined,
          newCustomRoleId: roleChanged ? (isCustom ? form.role.split("::")[1] : null) : undefined,
          callerIdToken: idToken,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "حدث خطأ أثناء التحديث");
      showToast("تم تحديث بيانات الموظف");
      setShowEdit(false);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "حدث خطأ أثناء التحديث", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: user.uid, callerIdToken: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ أثناء الحذف");
      showToast("تم حذف الموظف");
      router.push("/admin/users");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "حدث خطأ أثناء الحذف", "error");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Card className="flex flex-col items-center py-12 text-slate-400 gap-3">
        <p>هذا الموظف غير موجود</p>
        <Link href="/admin/users" className="text-[#1C2D50] font-semibold text-sm hover:underline">
          العودة إلى الموظفين
        </Link>
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

      {/* ── الترويسة: من هو، وبأي دور ── */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] font-bold text-xl shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-800 truncate">{user.name}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} className="text-slate-300" />
                  {user.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-slate-300" />
                  مُسجَّل {formatDate(user.createdAt)}
                </span>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-[#EEF1F7] text-[#1C2D50] rounded-full px-3 py-1 text-xs font-bold">
                {user.role === "admin" ? <ShieldCheck size={13} />
                  : user.role === "custom" ? <Shield size={13} />
                  : <Lock size={13} />}
                {roleName}
              </div>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={openEdit} className="gap-1.5">
                <Pencil size={14} /> تعديل
              </Button>
            )}
            {canDelete && user.uid !== appUser?.uid && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDelete(true)}
                className="gap-1.5 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> حذف
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── تعديل الموظف ── */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`تعديل: ${user.name}`}>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-500">{user.email}</div>
          <Input
            label="الاسم الكامل"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          {/* دور «أدمن» لا يُمنح ولا يُنزع من هنا — يُبقي على وجود مدير دائماً */}
          {user.role === "admin" ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
              هذا الحساب أدمن — دوره لا يُغيَّر من هذه الصفحة
            </div>
          ) : (
            <Select
              label="الدور"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {assignable.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {customRoles.length > 0 && (
                <optgroup label="أدوار مخصصة">
                  {customRoles.map((r) => (
                    <option key={r.id} value={`custom::${r.id}`}>{r.name}</option>
                  ))}
                </optgroup>
              )}
            </Select>
          )}
          <Input
            label="كلمة المرور الجديدة (اختياري)"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
            helperText="6 أحرف على الأقل إذا أردت التغيير"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ التعديلات</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="حذف الموظف"
        message={`هل أنت متأكد من حذف "${user.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
