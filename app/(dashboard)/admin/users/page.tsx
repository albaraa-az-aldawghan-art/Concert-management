"use client";

/* الموظفون: كل موظف مصنَّف تحت دوره، ودور كل مجموعة تُعدَّل صلاحياته من هنا —
   فمكان معرفة «من هو» ومكان تحديد «ما الذي يفتحه» صارا واحداً. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firestore/users";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, UserRole, CustomRole } from "@/types";
import { getCustomRoles } from "@/lib/firestore/roles";
import { PERMISSION_PAGES, normalizedFeatures } from "@/lib/permissions";
import { getLastSignIn, daysSince, sinceLabel, isIdle } from "@/lib/firestore/staff";
import { useSystem } from "@/contexts/SystemContext";
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
  const { settings } = useSystem();
  const { showToast } = useToast();
  const isAdmin = appUser?.role === "admin";
  const canCreate = feat("users", "create");
  const canEdit = feat("users", "edit");
  const canDelete = feat("users", "delete");
  /* «settings.roles» صلاحية قديمة من يوم كانت الأدوار في الإعدادات — تظل مقبولة */
  const canManageRoles = isAdmin || feat("users", "roles_view") || feat("users", "roles_edit");

  const [users, setUsers] = useState<AppUser[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [signIns, setSignIns] = useState<Record<string, string | null>>({});

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [editForm, setEditForm] = useState({ name: "", newPassword: "", role: "" });


  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [data, roles] = await Promise.all([getAllUsers(), getCustomRoles().catch(() => [])]);
    setUsers(data);
    setCustomRoles(roles);
    setLoading(false);
    /* نداء مجمّع واحد لكل الحسابات بعد العرض */
    getLastSignIn(data.map((x) => x.uid)).then(setSignIns);
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
            <Link href="/admin/users/roles">
              <Button variant="secondary" className="gap-2">
                <Shield size={16} /> الأدوار والصلاحيات
              </Button>
            </Link>
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
                    <Link
                      href={`/admin/users/roles/${g.custom!.id}`}
                      className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors"
                      title="تعديل صلاحيات الدور"
                    >
                      <Pencil size={14} />
                    </Link>
                    {/* حذف الأدوار وإنشاؤها في صفحة الأدوار — مكان واحد لا مكانان */}
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
                      className="relative flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 hover:bg-slate-100 transition-colors"
                    >
                      {/* الطبقة تغطي البطاقة فيُفتح الملف بالضغط عليها،
                          وأزرار التعديل والحذف فوقها بـ relative فلا تُبتلع */}
                      <Link
                        href={`/admin/users/${user.uid}`}
                        className="absolute inset-0 rounded-xl"
                        aria-label={`ملف ${user.name}`}
                      />
                      <div className="relative w-9 h-9 rounded-full bg-[#D4DCE8] flex items-center justify-center text-[#1C2D50] font-bold text-sm shrink-0">
                        {user.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1 pointer-events-none">
                        <p className="font-semibold text-slate-800 text-sm truncate">{user.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                        {user.uid in signIns ? (
                          <p
                            className={`text-[10px] mt-0.5 font-medium ${
                              isIdle(daysSince(signIns[user.uid]), settings.idleMonths)
                                ? "text-red-500"
                                : "text-slate-400"
                            }`}
                          >
                            آخر دخول {sinceLabel(daysSince(signIns[user.uid]))}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            مُسجَّل {formatDate(user.createdAt)}
                          </p>
                        )}
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="relative flex flex-col gap-0.5 shrink-0">
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

    </div>
  );
}
