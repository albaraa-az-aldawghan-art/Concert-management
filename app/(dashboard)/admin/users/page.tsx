"use client";

/* الموظفون: كل موظف مصنَّف تحت دوره، ودور كل مجموعة تُعدَّل صلاحياته من هنا —
   فمكان معرفة «من هو» ومكان تحديد «ما الذي يفتحه» صارا واحداً. */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firestore/users";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, UserRole, CustomRole, PermissionPage } from "@/types";
import {
  getCustomRoles,
  addCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from "@/lib/firestore/roles";
import { PERMISSION_PAGES, normalizedFeatures } from "@/lib/permissions";
import { getRoleLabel, formatDate } from "@/lib/utils";
import {
  Plus, Trash2, Users, Pencil, Shield, Eye, Settings2, ShieldCheck, Lock,
} from "lucide-react";

/* الأدوار الجاهزة التي لا تُشتق من كتالوج الصلاحيات — صلاحياتها مثبَّتة في الكود */
const BUILT_IN: { value: string; label: string; note: string }[] = [
  { value: "admin",             label: "أدمن",        note: "صلاحية كاملة على النظام — لا تُعدَّل" },
  { value: "warehouse_manager", label: "مدير الموارد", note: "الموارد وطلباتها والمفقودات" },
  { value: "supervisor",        label: "مشرف",         note: "الحفلات المسندة إليه" },
  { value: "employee",          label: "موظف",         note: "مهامه في الحفلات" },
  { value: "kitchen",           label: "مطبخ",         note: "طلبات المطبخ" },
];

/* الأدوار التي يجوز إسنادها عند الإضافة — «أدمن» ليس منها عمداً */
const assignable = BUILT_IN.filter((r) => r.value !== "admin");

/* الصفحة → مفاتيح الصلاحيات المفعّلة. صفحة موجودة بمصفوفة فارغة = عرض فقط. */
type PermMap = Partial<Record<PermissionPage, string[]>>;

/* مجموعة معروضة: دور واحد ومن يحمله */
interface RoleGroup {
  key: string;
  name: string;
  note: string;
  custom: CustomRole | null;
  members: AppUser[];
}

export default function StaffPage() {
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const canCreate = feat("users", "create");
  const canEdit = feat("users", "edit");
  const canDelete = feat("users", "delete");
  /* «settings.roles» صلاحية قديمة من يوم كانت الأدوار في الإعدادات — تظل مقبولة */
  const canManageRoles = isAdmin || feat("users", "roles") || feat("settings", "roles");

  const [users, setUsers] = useState<AppUser[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [editForm, setEditForm] = useState({ name: "", newPassword: "", role: "" });

  /* ── حالة الأدوار وصلاحياتها ── */
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<CustomRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<CustomRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [rolePerms, setRolePerms] = useState<PermMap>({});
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [data, roles] = await Promise.all([getAllUsers(), getCustomRoles().catch(() => [])]);
    setUsers(data);
    setCustomRoles(roles);
    setLoading(false);
  }

  /* قيمة الدور في النموذج: إما دور جاهز أو "custom::<id>" */
  const roleValueOf = (u: AppUser) =>
    u.role === "custom" && u.customRoleId ? `custom::${u.customRoleId}` : u.role;

  /* التصنيف: كل دور ومن يحمله. تُعرض الأدوار المخصصة أولاً لأنها التي تُدار من هنا،
     والمجموعات الفارغة تظهر أيضاً كي يُرى الدور الذي لم يُسند لأحد بعد. */
  const groups = useMemo<RoleGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (u: AppUser) =>
      !q || u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);

    const customGroups: RoleGroup[] = customRoles.map((r) => ({
      key: `custom::${r.id}`,
      name: r.name,
      note: "دور مخصص — صلاحياته محدّدة أدناه",
      custom: r,
      members: users.filter((u) => u.customRoleId === r.id && match(u)),
    }));

    const builtInGroups: RoleGroup[] = BUILT_IN.map((b) => ({
      key: b.value,
      name: b.label,
      note: b.note,
      custom: null,
      members: users.filter((u) => u.role === b.value && match(u)),
    }));

    /* موظف على دور مخصص حُذف مرجعه — لا يُخفى بل يُعرض ليُصلَح */
    const orphans = users.filter(
      (u) => u.role === "custom" && !customRoles.some((r) => r.id === u.customRoleId) && match(u)
    );

    const all = [...customGroups, ...builtInGroups];
    if (orphans.length) {
      all.push({ key: "__orphan", name: "دور محذوف", note: "الدور المرتبط لم يعد موجوداً — أسند دوراً آخر", custom: null, members: orphans });
    }
    return q ? all.filter((g) => g.members.length > 0) : all;
  }, [users, customRoles, query]);

  const shown = groups.reduce((s, g) => s + g.members.length, 0);

  /* ── الأدوار ── */
  function openAddRole() {
    setEditRoleTarget(null);
    setRoleName("");
    setRolePerms({});
    setShowRoleForm(true);
  }

  function openEditRole(role: CustomRole) {
    setEditRoleTarget(role);
    setRoleName(role.name);
    /* توحيد القيم القديمة "view"/"manage" إلى مصفوفات صلاحيات */
    const normalized: PermMap = {};
    for (const p of PERMISSION_PAGES) {
      const feats = normalizedFeatures(role, p.key);
      if (feats !== null) normalized[p.key] = [...feats];
    }
    setRolePerms(normalized);
    setShowRoleForm(true);
  }

  function togglePage(page: PermissionPage) {
    setRolePerms((prev) => {
      const next = { ...prev };
      if (page in next) delete next[page];
      /* تفعيل الصفحة يبدأ بكل صلاحياتها مُحدَّدة */
      else next[page] = PERMISSION_PAGES.find((p) => p.key === page)!.features.map((f) => f.key);
      return next;
    });
  }

  function toggleFeature(page: PermissionPage, featureKey: string) {
    setRolePerms((prev) => {
      const current = prev[page];
      if (current === undefined) return prev;
      return {
        ...prev,
        [page]: current.includes(featureKey)
          ? current.filter((f) => f !== featureKey)
          : [...current, featureKey],
      };
    });
  }

  async function handleSaveRole() {
    if (!appUser || !roleName.trim()) return;
    if (Object.keys(rolePerms).length === 0) {
      showToast("اختر صلاحية واحدة على الأقل", "error");
      return;
    }
    setRoleSaving(true);
    try {
      if (editRoleTarget) {
        await updateCustomRole(editRoleTarget.id, { name: roleName.trim(), permissions: rolePerms });
        showToast("تم تحديث الدور");
      } else {
        await addCustomRole({ name: roleName.trim(), permissions: rolePerms, createdBy: appUser.uid });
        showToast("تم إنشاء الدور");
      }
      setShowRoleForm(false);
      load();
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!deleteRoleTarget) return;
    setRoleSaving(true);
    try {
      await deleteCustomRole(deleteRoleTarget.id);
      showToast("تم حذف الدور");
      setDeleteRoleTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setRoleSaving(false);
    }
  }

  /* ── الموظفون ── */
  function openEdit(user: AppUser) {
    setEditTarget(user);
    setEditForm({ name: user.name, newPassword: "", role: roleValueOf(user) });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser) return;
    setSaving(true);
    try {
      const isCustom = form.role.startsWith("custom::");
      const role = (isCustom ? "custom" : form.role) as UserRole;
      const customRoleId = isCustom ? form.role.split("::")[1] : null;

      /* الإنشاء على الخادم بـ Admin SDK: يُبقي جلسة المدير كما هي،
         ولا يترك حساب مصادقة يتيماً إن فشلت خطوة */
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          role,
          customRoleId,
          callerIdToken: idToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ أثناء الإنشاء");

      showToast("تمت إضافة الموظف");
      setShowAdd(false);
      setForm({ name: "", email: "", password: "", role: "employee" });
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "حدث خطأ أثناء الإنشاء", "error");
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

    /* الدور يُرسل فقط عند تغيّره فعلاً */
    const roleChanged = editForm.role !== roleValueOf(editTarget);
    const isCustom = editForm.role.startsWith("custom::");

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
          newRole: roleChanged ? (isCustom ? "custom" : editForm.role) : undefined,
          newCustomRoleId: roleChanged ? (isCustom ? editForm.role.split("::")[1] : null) : undefined,
          callerIdToken: idToken,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "unknown");
      }

      showToast("تم تحديث بيانات الموظف");
      setEditTarget(null);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "غير مصرح") showToast("غير مصرح بهذا الإجراء", "error");
      else if (msg.includes("لم يتم إعداد")) showToast("يجب إعداد Firebase Admin SDK أولاً", "error");
      else showToast(msg || "حدث خطأ أثناء التحديث", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      /* الحذف على الخادم يزيل حساب المصادقة أيضاً فيعود البريد قابلاً للاستخدام */
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: deleteTarget.uid, callerIdToken: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ أثناء الحذف");

      showToast("تم حذف الموظف");
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "حدث خطأ أثناء الحذف", "error");
    } finally {
      setSaving(false);
    }
  }

  /* شارات الصفحات التي يفتحها الدور — تُقرأ بلمحة دون فتح النافذة */
  function permChips(role: CustomRole) {
    const chips = PERMISSION_PAGES.map((p) => {
      const feats = normalizedFeatures(role, p.key);
      if (feats === null) return null;
      const full = p.features.every((f) => feats.includes(f.key));
      return (
        <span
          key={p.key}
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
            full ? "bg-[#1C2D50] text-white"
              : feats.length > 0 ? "bg-indigo-100 text-indigo-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {feats.length > 0 ? <Settings2 size={10} /> : <Eye size={10} />}
          {p.label}
          {!full && feats.length > 0 && ` (${feats.length})`}
        </span>
      );
    }).filter(Boolean);
    return chips.length ? chips : (
      <span className="text-[11px] text-slate-400">لا صلاحيات — لن يرى الموظف شيئاً</span>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">الموظفون</h2>
          <p className="text-sm text-slate-500">
            {users.length} موظف · {customRoles.length} دور مخصص
          </p>
        </div>
        <div className="flex gap-2">
          {canManageRoles && (
            <Button variant="secondary" onClick={openAddRole} className="gap-2">
              <Shield size={16} /> دور جديد
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus size={16} /> إضافة موظف
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="ابحث باسم الموظف أو بريده"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <p className="text-xs text-slate-400 mt-1">{shown} نتيجة</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#1C2D50] border-t-transparent animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-slate-400">
          <Users size={40} className="mb-3 opacity-40" />
          <p>لا يوجد موظف مطابق</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key} className="space-y-3">
              {/* رأس المجموعة: الدور واسمه وما يفتحه */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {g.custom ? (
                      <Shield size={16} className="text-[#1C2D50] shrink-0" />
                    ) : g.key === "admin" ? (
                      <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                    ) : (
                      <Lock size={16} className="text-slate-300 shrink-0" />
                    )}
                    <h3 className="font-bold text-slate-800">{g.name}</h3>
                    <span className="text-xs text-slate-400">
                      {g.members.length} موظف
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 pe-6">{g.note}</p>
                </div>
                {g.custom && canManageRoles && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEditRole(g.custom!)}
                      className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors"
                      title="تعديل صلاحيات الدور"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteRoleTarget(g.custom!)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف الدور"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {g.custom && (
                <div className="flex flex-wrap gap-1.5">{permChips(g.custom)}</div>
              )}

              {/* أعضاء المجموعة */}
              {g.members.length === 0 ? (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
                  لم يُسند هذا الدور إلى أحد بعد
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {g.members.map((user) => (
                    <div
                      key={user.uid}
                      className="relative flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] font-bold text-sm shrink-0">
                        {user.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 text-sm truncate">{user.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                        <p className="text-[10px] text-slate-300 mt-0.5">
                          مُسجَّل {formatDate(user.createdAt)}
                        </p>
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(user)}
                              className="p-1 text-slate-300 hover:text-[#1C2D50] hover:bg-white rounded-lg transition-colors"
                              title="تعديل الاسم وكلمة المرور والدور"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete && user.uid !== appUser?.uid && (
                            <button
                              onClick={() => setDeleteTarget(user)}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                              title="حذف"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {canManageRoles && (
        <p className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><Eye size={11} /> عرض فقط</span>
          <span className="inline-flex items-center gap-1"><Settings2 size={11} /> صلاحيات جزئية (العدد) أو كاملة</span>
          <span className="inline-flex items-center gap-1"><Lock size={11} /> دور جاهز — صلاحياته مثبَّتة في النظام</span>
        </p>
      )}

      {/* ── إضافة موظف ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة موظف جديد">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="الاسم الكامل"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="اسم الموظف"
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
            {assignable.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            {customRoles.length > 0 && (
              <optgroup label="أدوار مخصصة">
                {customRoles.map((r) => (
                  <option key={r.id} value={`custom::${r.id}`}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button type="submit" loading={saving}>إضافة الموظف</Button>
          </div>
        </form>
      </Modal>

      {/* ── تعديل موظف ── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`تعديل: ${editTarget?.name}`}>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-500">
            {editTarget?.email}
          </div>
          <Input
            label="الاسم الكامل"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
            placeholder="اسم الموظف"
          />
          {/* دور «أدمن» لا يُمنح ولا يُنزع من هنا — يُبقي على وجود مدير واحد دائماً */}
          {editTarget?.role === "admin" ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
              هذا الحساب أدمن — دوره لا يُغيَّر من هذه الصفحة
            </div>
          ) : (
            <Select
              label="الدور"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            >
              {assignable.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
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

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الموظف"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        loading={saving}
      />

      {/* ── إنشاء/تعديل دور وصلاحياته ── */}
      <Modal
        open={showRoleForm}
        onClose={() => setShowRoleForm(false)}
        title={editRoleTarget ? `تعديل الدور: ${editRoleTarget.name}` : "إنشاء دور جديد"}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="اسم الدور"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="مثال: محاسب، مدير حفلات، مشرف موارد..."
            required
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">
                الصفحات والصلاحيات المرتبطة بهذا الدور
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setRolePerms(
                      Object.fromEntries(
                        PERMISSION_PAGES.map((p) => [p.key, p.features.map((f) => f.key)])
                      ) as PermMap
                    )
                  }
                  className="text-xs text-[#1C2D50] font-semibold hover:underline"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setRolePerms({})}
                  className="text-xs text-slate-400 font-semibold hover:underline"
                >
                  مسح الكل
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[46vh] overflow-y-auto">
              {PERMISSION_PAGES.map((p) => {
                const enabled = p.key in rolePerms;
                const feats = rolePerms[p.key] ?? [];
                const allChecked = enabled && p.features.every((f) => feats.includes(f.key));
                return (
                  <div key={p.key} className="bg-white">
                    <label className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => togglePage(p.key)}
                          className="accent-[#1C2D50] cursor-pointer"
                          style={{ width: 17, height: 17 }}
                        />
                        <span className="text-sm font-bold text-slate-800">{p.label}</span>
                      </span>
                      {enabled && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {feats.length === 0 ? "عرض فقط" : `${feats.length} من ${p.features.length} صلاحية`}
                        </span>
                      )}
                    </label>

                    {/* الصفحات بلا صلاحيات فرعية عرضٌ بطبيعتها */}
                    {enabled && p.features.length > 0 && (
                      <div className="bg-slate-50 border-t border-slate-100 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setRolePerms((prev) => ({
                              ...prev,
                              [p.key]: allChecked ? [] : p.features.map((f) => f.key),
                            }))
                          }
                          className="text-[11px] text-[#1C2D50] font-semibold hover:underline mb-1.5"
                        >
                          {allChecked ? "إلغاء تحديد الكل" : "تحديد الكل"}
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                          {p.features.map((f) => (
                            <label
                              key={f.key}
                              className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-800 transition-colors py-0.5"
                            >
                              <input
                                type="checkbox"
                                checked={feats.includes(f.key)}
                                onChange={() => toggleFeature(p.key, f.key)}
                                className="accent-[#1C2D50] cursor-pointer shrink-0"
                                style={{ width: 15, height: 15 }}
                              />
                              <span className="text-[13px]">{f.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              تفعيل الصفحة بدون تحديد أي صلاحية = عرض فقط بدون إضافة أو تعديل
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowRoleForm(false)}>إلغاء</Button>
            <Button onClick={handleSaveRole} loading={roleSaving} disabled={!roleName.trim()}>
              {editRoleTarget ? "حفظ التغييرات" : "إنشاء الدور"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteRoleTarget}
        onClose={() => setDeleteRoleTarget(null)}
        onConfirm={handleDeleteRole}
        title="حذف الدور"
        message={`هل أنت متأكد من حذف الدور "${deleteRoleTarget?.name}"؟ لن يُحذف إذا كان مرتبطاً بموظفين.`}
        confirmLabel="حذف"
        loading={roleSaving}
      />
    </div>
  );
}
