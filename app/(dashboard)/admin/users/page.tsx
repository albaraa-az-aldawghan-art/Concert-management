"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, createUser, deleteUser } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, UserRole } from "@/types";
import { getRoleLabel, formatDate } from "@/lib/utils";
import { Plus, Trash2, Users } from "lucide-react";

const roleOptions = [
  { value: "warehouse_manager", label: "مدير المخازن" },
  { value: "supervisor", label: "مشرف" },
  { value: "employee", label: "موظف" },
];

const roleColors: Record<string, "blue" | "indigo" | "green" | "gray"> = {
  admin: "blue",
  warehouse_manager: "indigo",
  supervisor: "green",
  employee: "gray",
};

export default function UsersPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterRole, setFilterRole] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee" as UserRole,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const data = await getAllUsers();
    setUsers(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    setSaving(true);
    try {
      await createUser(form.email, form.password, form.name, form.role, appUser.uid);
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

  const filteredUsers = filterRole
    ? users.filter((u) => u.role === filterRole)
    : users;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">إدارة المستخدمين</h2>
          <p className="text-sm text-slate-500">{users.length} مستخدم مسجل</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus size={16} />
          إضافة مستخدم
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "warehouse_manager", "supervisor", "employee"].map((role) => (
          <button
            key={role}
            onClick={() => setFilterRole(role)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterRole === role
                ? "bg-blue-700 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {role ? getRoleLabel(role) : "الكل"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-blue-700 border-t-transparent animate-spin" />
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
              {user.uid !== appUser?.uid && (
                <button
                  onClick={() => setDeleteTarget(user)}
                  className="absolute top-3 left-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{user.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={roleColors[user.role] ?? "gray"}>
                  {getRoleLabel(user.role)}
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
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            required
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={saving}>
              إنشاء المستخدم
            </Button>
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
