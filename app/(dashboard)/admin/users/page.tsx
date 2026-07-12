"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, createUser, deleteUser } from "@/lib/firestore/users";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, UserRole, CustomRole } from "@/types";
import { getCustomRoles } from "@/lib/firestore/roles";
import { getRoleLabel, formatDate } from "@/lib/utils";
import { Plus, Trash2, Users, Pencil } from "lucide-react";

const roleOptions = [
  { value: "warehouse_manager", label: "مدير المخازن" },
  { value: "supervisor", label: "مشرف" },
  { value: "employee", label: "موظف" },
  { value: "kitchen", label: "مطبخ" },
];

const roleColors: Record<string, "blue" | "indigo" | "green" | "gray"> = {
  admin: "blue",
  warehouse_manager: "indigo",
  supervisor: "green",
  employee: "gray",
  kitchen: "indigo",
};

export default function UsersPage() {
  const { appUser, can } = useAuth();
  const { showToast } = useToast();
  const canManage = can("users", "manage");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterRole, setFilterRole] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee", // base role value OR "custom::<roleId>"
  });

  const [editForm, setEditForm] = useState({ name: "", newPassword: "" });

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const [data, roles] = await Promise.all([getAllUsers(), getCustomRoles().catch(() => [])]);
    setUsers(data);
    setCustomRoles(roles);
    setLoading(false);
  }

  const customRoleName = (id?: string | null) => customRoles.find((r) => r.id === id)?.name ?? "دور مخصص";

  function openEdit(user: AppUser) {
    setEditTarget(user);
    setEditForm({ name: user.name, newPassword: "" });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    setSaving(true);
    try {
      const isCustom = form.role.startsWith("custom::");
      const role = (isCustom ? "custom" : form.role) as UserRole;
      const customRoleId = isCustom ? form.role.split("::")[1] : null;
      await createUser(form.email, form.password, form.name, role, appUser.uid, customRoleId);
      showToast("تم إنشاء المستخدم بنجاح");
      setShowAdd(false);
      setForm({ name: "", email: "", password: "", role: "employee" });
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      showToast(msg.includes("email-already") ? "البريد الإلكتروني مستخدم مسبقاً" : "حدث خطأ أثناء الإنشاء", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;

    const trimName = editForm.name.trim();
    const trimPass = editForm.newPassword.trim();

    if (!trimName) { showToast("الاسم مطلوب", "error"); return; }
    if (trimPass && trimPass.length < 6) {
      showToast("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "error");
      return;
    }

    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: editTarget.uid,
          newName: trimName !== editTarget.name ? trimName : undefined,
          newPassword: trimPass || undefined,
          callerIdToken: idToken,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "unknown");
      }

      showToast("تم تحديث بيانات المستخدم");
      setEditTarget(null);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "غير مصرح") {
        showToast("غير مصرح بهذا الإجراء", "error");
      } else if (msg.includes("لم يتم إعداد")) {
        showToast("يجب إعداد Firebase Admin SDK أولاً — راجع الإعدادات", "error");
      } else {
        showToast("حدث خطأ أثناء التحديث", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteUser(deleteTarget.uid);
      showToast("تم حذف المستخدم");
      setDeleteTarget(null);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) {
        showToast("خطأ في الصلاحيات — تأكد من تحديث قواعد Firestore", "error");
      } else {
        showToast("حدث خطأ أثناء الحذف", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = filterRole ? users.filter((u) => u.role === filterRole) : users;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">إدارة المستخدمين</h2>
          <p className="text-sm text-slate-500">{users.length} مستخدم مسجل</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus size={16} />
            إضافة مستخدم
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "warehouse_manager", "supervisor", "employee", "kitchen", "custom"].map((role) => (
          <button
            key={role}
            onClick={() => setFilterRole(role)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterRole === role
                ? "bg-[#1C2D50] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {role ? getRoleLabel(role) : "الكل"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Users size={40} className="mb-3 opacity-40" />
          <p>لا يوجد مستخدمون</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map((user) => (
            <Card key={user.uid} className="relative">
              {/* Actions */}
              {canManage && (
                <div className="absolute top-3 left-3 flex gap-1">
                  <button
                    onClick={() => openEdit(user)}
                    className="p-1.5 text-slate-300 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors"
                    title="تعديل الاسم وكلمة المرور"
                  >
                    <Pencil size={14} />
                  </button>
                  {user.uid !== appUser?.uid && (
                    <button
                      onClick={() => setDeleteTarget(user)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] font-bold text-sm">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{user.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={roleColors[user.role] ?? "gray"}>
                  {user.role === "custom" ? customRoleName(user.customRoleId) : getRoleLabel(user.role)}
                </Badge>
                <span className="text-xs text-slate-400">{formatDate(user.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مستخدم جديد">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="الاسم الكامل"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="اسم المستخدم"
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            placeholder="user@example.com"
            dir="ltr"
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            placeholder="6 أحرف على الأقل"
            helperText="يجب أن تكون 6 أحرف على الأقل"
          />
          <Select
            label="الدور"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            required
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            {customRoles.length > 0 && (
              <optgroup label="أدوار مخصصة (من الإعدادات)">
                {customRoles.map((r) => (
                  <option key={r.id} value={`custom::${r.id}`}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>إنشاء المستخدم</Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`تعديل: ${editTarget?.name}`}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-500">
            {editTarget?.email}
          </div>
          <Input
            label="الاسم الكامل"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
            placeholder="اسم المستخدم"
          />
          <Input
            label="كلمة المرور الجديدة (اختياري)"
            type="password"
            value={editForm.newPassword}
            onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
            placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
            helperText="6 أحرف على الأقل إذا أردت التغيير"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>إلغاء</Button>
            <Button type="submit" loading={saving}>حفظ التعديلات</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المستخدم"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        loading={saving}
      />
    </div>
  );
}
