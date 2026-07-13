"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { KeyRound, ShieldCheck, Percent, Shield, Plus, Pencil, Trash2, Eye, Settings2 } from "lucide-react";
import { getVatRate, updateVatRate } from "@/lib/firestore/settings";
import { getCustomRoles, addCustomRole, updateCustomRole, deleteCustomRole } from "@/lib/firestore/roles";
import { PERMISSION_PAGES, normalizedFeatures } from "@/lib/permissions";
import { CustomRole, PermissionPage } from "@/types";

// Page → enabled feature keys. Page present with [] = view only.
type PermMap = Partial<Record<PermissionPage, string[]>>;

export default function SettingsPage() {
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canEditVat = appUser?.role === "admin" || feat("settings", "vat") || feat("finances", "vat");
  const canManageRoles = appUser?.role === "admin" || feat("settings", "roles");

  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [vatRateInput, setVatRateInput] = useState("");
  const [vatSaving, setVatSaving] = useState(false);

  // ── Roles & permissions state (admin only) ──
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<CustomRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<CustomRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [rolePerms, setRolePerms] = useState<PermMap>({});
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => {
    getVatRate().then((r) => setVatRateInput(String(r)));
  }, []);

  useEffect(() => {
    if (canManageRoles) loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageRoles]);

  async function loadRoles() {
    try {
      setRoles(await getCustomRoles());
    } catch {
      /* silent — section simply stays empty */
    }
  }

  function openAddRole() {
    setEditRoleTarget(null);
    setRoleName("");
    setRolePerms({});
    setShowRoleForm(true);
  }

  function openEditRole(role: CustomRole) {
    setEditRoleTarget(role);
    setRoleName(role.name);
    // Normalize legacy "view"/"manage" values into feature arrays
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
      if (page in next) {
        delete next[page];
      } else {
        // Enabling a page starts with ALL its capabilities checked
        next[page] = PERMISSION_PAGES.find((p) => p.key === page)!.features.map((f) => f.key);
      }
      return next;
    });
  }

  function toggleFeature(page: PermissionPage, featureKey: string) {
    setRolePerms((prev) => {
      const current = prev[page];
      if (current === undefined) return prev;
      const next = { ...prev };
      next[page] = current.includes(featureKey)
        ? current.filter((f) => f !== featureKey)
        : [...current, featureKey];
      return next;
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
      loadRoles();
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
      loadRoles();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "حدث خطأ", "error");
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleVatSave() {
    const rate = parseFloat(vatRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast("يجب أن تكون النسبة بين 0 و 100", "error");
      return;
    }
    setVatSaving(true);
    try {
      await updateVatRate(rate);
      showToast("تم تحديث نسبة الضريبة");
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setVatSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPass.length < 6) {
      showToast("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل", "error");
      return;
    }
    if (form.newPass !== form.confirm) {
      showToast("كلمة المرور الجديدة وتأكيدها غير متطابقتين", "error");
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("not_logged_in");

      // Re-authenticate before updating
      const credential = EmailAuthProvider.credential(user.email, form.current);
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, form.newPass);
      showToast("تم تغيير كلمة المرور بنجاح");
      setForm({ current: "", newPass: "", confirm: "" });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        showToast("كلمة المرور الحالية غير صحيحة", "error");
      } else if (code === "auth/too-many-requests") {
        showToast("محاولات كثيرة جداً، حاول لاحقاً", "error");
      } else {
        showToast("حدث خطأ، حاول مرة أخرى", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">الإعدادات</h2>
        <p className="text-sm text-slate-500 mt-0.5">{appUser?.email}</p>
      </div>

      {/* ── Roles & Permissions — admin or a role granted settings.roles ── */}
      {canManageRoles && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#EEF1F7] rounded-xl flex items-center justify-center">
                <Shield size={20} className="text-[#1C2D50]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">الأدوار والصلاحيات</h3>
                <p className="text-xs text-slate-400">أنشئ أدواراً مخصصة وحدد صلاحية كل صفحة (عرض أو تحكم)</p>
              </div>
            </div>
            <Button size="sm" onClick={openAddRole}>
              <Plus size={14} /> دور جديد
            </Button>
          </div>

          {roles.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              لا توجد أدوار مخصصة — أنشئ دوراً ثم اربطه بمستخدم من صفحة المستخدمين
            </p>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <div key={role.id} className="flex items-start justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{role.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {PERMISSION_PAGES.map((p) => {
                        const feats = normalizedFeatures(role, p.key);
                        if (feats === null) return null;
                        const full = p.features.every((f) => feats.includes(f.key));
                        return (
                          <span
                            key={p.key}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              full
                                ? "bg-[#1C2D50] text-white"
                                : feats.length > 0
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {feats.length > 0 ? <Settings2 size={10} /> : <Eye size={10} />}
                            {p.label}
                            {!full && feats.length > 0 && ` (${feats.length})`}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEditRole(role)}
                      className="p-1.5 text-slate-400 hover:text-[#1C2D50] hover:bg-[#EEF1F7] rounded-lg transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteRoleTarget(role)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-4 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Eye size={11} /> عرض فقط</span>
            <span className="inline-flex items-center gap-1"><Settings2 size={11} /> صلاحيات جزئية (العدد) أو كاملة</span>
          </p>
        </Card>
      )}

      {/* VAT Rate — admin or a custom role granted finances.vat */}
      {canEditVat && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Percent size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">نسبة الضريبة المضافة (VAT)</h3>
              <p className="text-xs text-slate-400">تُطبَّق على جميع الحفلات الجديدة</p>
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="النسبة (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={vatRateInput}
                onChange={(e) => setVatRateInput(e.target.value)}
                placeholder="15"
              />
            </div>
            <Button onClick={handleVatSave} loading={vatSaving} className="shrink-0">
              حفظ
            </Button>
          </div>

          {vatRateInput && parseFloat(vatRateInput) >= 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm">
              <p className="text-amber-700 font-medium mb-1">مثال على سعر حفلة 1000 ريال:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">الضريبة ({vatRateInput}%): </span>
                  <span className="font-bold text-amber-700">
                    {(1000 * parseFloat(vatRateInput) / (100 + parseFloat(vatRateInput))).toLocaleString("en-US")} ريال
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">بدون ضريبة: </span>
                  <span className="font-bold text-slate-700">
                    {(1000 / (1 + parseFloat(vatRateInput) / 100)).toLocaleString("en-US")} ريال
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#EEF1F7] rounded-xl flex items-center justify-center">
            <KeyRound size={20} className="text-[#1C2D50]" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">تغيير كلمة المرور</h3>
            <p className="text-xs text-slate-400">يجب إدخال كلمة المرور الحالية للتحقق</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="كلمة المرور الحالية"
            type="password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            required
            placeholder="أدخل كلمة مرورك الحالية"
          />
          <Input
            label="كلمة المرور الجديدة"
            type="password"
            value={form.newPass}
            onChange={(e) => setForm({ ...form, newPass: e.target.value })}
            required
            placeholder="6 أحرف على الأقل"
            helperText="يجب أن تكون 6 أحرف على الأقل"
          />
          <Input
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
            placeholder="أعد إدخال كلمة المرور الجديدة"
          />
          <Button type="submit" loading={saving} className="w-full gap-2">
            <ShieldCheck size={16} />
            تحديث كلمة المرور
          </Button>
        </form>
      </Card>

      {/* ── Role add/edit modal ── */}
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
            placeholder="مثال: محاسب، مدير حفلات، مشرف مخزن..."
            required
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">الصلاحيات</label>
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
                    {/* Page master toggle */}
                    <label className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => togglePage(p.key)}
                          className="w-4.5 h-4.5 accent-[#1C2D50] cursor-pointer"
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

                    {/* Feature checklist (pages without sub-features are view-only by nature) */}
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
                            <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-800 transition-colors py-0.5">
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
        message={`هل أنت متأكد من حذف الدور "${deleteRoleTarget?.name}"؟ لن يُحذف إذا كان مرتبطاً بمستخدمين.`}
        confirmLabel="حذف"
        loading={roleSaving}
      />
    </div>
  );
}
