"use client";

/* تحرير صلاحيات دور — صفحة كاملة لا نافذة منبثقة.
   عمود يمين: الصفحات وعدد ما مُنح في كل واحدة.
   المساحة الكبرى: مجموعات الصفحة المختارة، وفي كل مجموعة الإجراءات
   ثم الحقول الظاهرة، كلٌّ صندوق مستقل. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getCustomRoles, updateCustomRole } from "@/lib/firestore/roles";
import { getAllUsers } from "@/lib/firestore/users";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppUser, CustomRole, PermissionPage } from "@/types";
import {
  PERMISSION_CATALOG, normalizedFeatures, roleDocIdFor, TOTAL_PERMISSIONS,
} from "@/lib/permissions";
import {
  ChevronRight, Save, Shield, ShieldCheck, Eye, Zap, AlertTriangle, Users,
  CheckSquare, Square, RotateCcw,
} from "lucide-react";

/** الصفحة ← مفاتيحها الممنوحة. غياب الصفحة = لا تُفتح أصلاً. */
type PermMap = Partial<Record<PermissionPage, string[]>>;

export default function RoleEditorPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const router = useRouter();
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canEdit = appUser?.role === "admin" || feat("users", "roles_edit");

  const [role, setRole] = useState<CustomRole | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<PermMap>({});
  const [initial, setInitial] = useState<string>("");
  const [active, setActive] = useState<PermissionPage>(PERMISSION_CATALOG[0].key);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [roleId]);

  async function load() {
    setLoading(true);
    const [roles, u] = await Promise.all([getCustomRoles().catch(() => []), getAllUsers().catch(() => [])]);
    const r = roles.find((x) => x.id === roleId) ?? null;
    setRole(r);
    setUsers(u);
    if (r) {
      setName(r.name);
      /* توحيد الصيغة القديمة ("view"/"manage") إلى مصفوفات */
      const norm: PermMap = {};
      for (const p of PERMISSION_CATALOG) {
        const f = normalizedFeatures(r, p.key);
        if (f !== null) norm[p.key] = [...f];
      }
      setPerms(norm);
      setInitial(JSON.stringify(norm) + "|" + r.name);
    }
    setLoading(false);
  }

  const dirty = JSON.stringify(perms) + "|" + name !== initial;

  const holders = useMemo(
    () => users.filter((u) => u.role !== "admin" && roleDocIdFor(u) === roleId),
    [users, roleId]
  );

  const page = PERMISSION_CATALOG.find((p) => p.key === active)!;
  /* «قيد الربط» تُستثنى من كل شيء: لا تُمنح ولا تُعدّ ولا تُحدَّد بالجملة */
  const pageKeys = (p: typeof page) =>
    p.groups.flatMap((g) => [
      ...g.actions.filter((a) => !a.pending).map((a) => a.key),
      ...(g.fields ?? []).filter((f) => !f.pending).map((f) => f.key),
    ]);

  const grantedIn = (key: PermissionPage) => perms[key]?.length ?? 0;
  const pageOpen = (key: PermissionPage) => key in perms;
  const totalGranted = Object.values(perms).reduce((s, a) => s + (a?.length ?? 0), 0);

  function togglePage(key: PermissionPage) {
    setPerms((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      /* فتح الصفحة يبدأ بكل صلاحياتها — النزع أسهل من الجمع واحدة واحدة */
      else next[key] = pageKeys(PERMISSION_CATALOG.find((p) => p.key === key)!);
      return next;
    });
  }

  function toggleKey(pageKey: PermissionPage, k: string) {
    setPerms((prev) => {
      const cur = prev[pageKey];
      /* أول تحديد داخل صفحة مغلقة يفتحها بهذا المفتاح وحده */
      if (cur === undefined) return { ...prev, [pageKey]: [k] };
      return {
        ...prev,
        [pageKey]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k],
      };
    });
  }

  function setGroup(pageKey: PermissionPage, keys: string[], on: boolean) {
    setPerms((prev) => {
      const cur = prev[pageKey] ?? [];
      const next = on
        ? [...new Set([...cur, ...keys])]
        : cur.filter((k) => !keys.includes(k));
      return { ...prev, [pageKey]: next };
    });
  }

  async function handleSave() {
    if (!role) return;
    if (!name.trim()) { showToast("اسم الدور مطلوب", "error"); return; }
    setSaving(true);
    try {
      await updateCustomRole(role.id, { name: name.trim(), permissions: perms });
      showToast("حُفظت الصلاحيات");
      setInitial(JSON.stringify(perms) + "|" + name.trim());
      load();
    } catch {
      showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
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

  if (!role) {
    return (
      <Card className="flex flex-col items-center py-12 text-slate-400 gap-3">
        <p>هذا الدور غير موجود</p>
        <Link href="/admin/users/roles" className="text-[#1C2D50] font-semibold text-sm hover:underline">
          العودة إلى الأدوار
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin/users/roles"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#1C2D50] transition-colors"
      >
        <ChevronRight size={16} />
        الأدوار
      </Link>

      {/* ── الترويسة: الاسم والحفظ ── */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {role.builtIn ? <ShieldCheck size={16} className="text-[#1C2D50]" />
                            : <Shield size={16} className="text-[#1C2D50]" />}
              <h2 className="font-bold text-slate-800">{role.name}</h2>
              {role.builtIn && (
                <span className="text-[10px] bg-[#EEF1F7] text-[#1C2D50] px-2 py-0.5 rounded-full font-semibold">
                  دور جاهز
                </span>
              )}
            </div>
            <Input
              label="اسم الدور"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
            />
            {role.hint && <p className="text-xs text-slate-400 mt-1.5">{role.hint}</p>}
          </div>

          <div className="flex items-end gap-3 shrink-0">
            <div className="text-xs text-slate-500 leading-relaxed">
              <p>
                <span className="font-bold text-[#1C2D50] tabular-nums">{totalGranted}</span>
                {" "}من {TOTAL_PERMISSIONS} صلاحية
              </p>
              <p className="inline-flex items-center gap-1 mt-0.5">
                <Users size={12} className="text-slate-300" />
                {holders.length} موظف يحمله
              </p>
            </div>
            {canEdit && (
              <>
                {dirty && (
                  <Button variant="secondary" onClick={load} className="gap-1.5">
                    <RotateCcw size={14} /> تراجع
                  </Button>
                )}
                <Button onClick={handleSave} loading={saving} disabled={!dirty} className="gap-1.5">
                  <Save size={14} /> حفظ
                </Button>
              </>
            )}
          </div>
        </div>

        {totalGranted === 0 && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            هذا الدور لا يفتح أي صفحة — من يحمله يسجّل دخوله ولا يرى شيئاً
          </div>
        )}
        {dirty && (
          <p className="mt-3 text-xs text-amber-600 font-medium">
            تغييرات غير محفوظة — تسري على {holders.length} موظف فور الحفظ
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* ── الصفحات ── */}
        <Card className="lg:sticky lg:top-4 p-2">
          <p className="text-xs font-bold text-slate-500 px-2 py-2">الصفحات</p>
          <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
            {PERMISSION_CATALOG.map((p) => {
              const n = grantedIn(p.key);
              const all = pageKeys(p).length;
              const on = pageOpen(p.key);
              return (
                <button
                  key={p.key}
                  onClick={() => setActive(p.key)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-right transition-colors ${
                    active === p.key ? "bg-[#1C2D50] text-white" : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="text-sm font-medium truncate">{p.label}</span>
                  <span
                    className={`text-[11px] tabular-nums shrink-0 font-semibold px-1.5 py-0.5 rounded-full ${
                      active === p.key
                        ? "bg-white/15 text-white"
                        : !on ? "text-slate-300"
                        : n === all ? "bg-[#1C2D50] text-white"
                        : "bg-[#EEF1F7] text-[#1C2D50]"
                    }`}
                  >
                    {on ? `${n}/${all}` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── مجموعات الصفحة المختارة ── */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800">{page.label}</h3>
                {page.hint && <p className="text-xs text-slate-400 mt-1">{page.hint}</p>}
              </div>
              {canEdit && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageOpen(page.key)}
                    onChange={() => togglePage(page.key)}
                    className="accent-[#1C2D50] cursor-pointer"
                    style={{ width: 17, height: 17 }}
                  />
                  يفتح هذه الصفحة
                </label>
              )}
            </div>
            {!pageOpen(page.key) && (
              <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                الصفحة مغلقة على هذا الدور. فعّلها أو حدّد صلاحية أدناه لفتحها.
              </p>
            )}
          </Card>

          {page.groups.map((g) => {
            const acts = g.actions.filter((a) => !a.pending).map((a) => a.key);
            const flds = (g.fields ?? []).filter((f) => !f.pending).map((f) => f.key);
            const cur = perms[page.key] ?? [];
            const allOn = [...acts, ...flds].every((k) => cur.includes(k));
            return (
              <Card key={g.key}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800 text-sm">{g.label}</h4>
                    {g.hint && <p className="text-xs text-slate-400 mt-0.5">{g.hint}</p>}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setGroup(page.key, [...acts, ...flds], !allOn)}
                      className="text-xs font-semibold text-[#1C2D50] hover:underline shrink-0 inline-flex items-center gap-1"
                    >
                      {allOn ? <Square size={12} /> : <CheckSquare size={12} />}
                      {allOn ? "إلغاء الكل" : "تحديد الكل"}
                    </button>
                  )}
                </div>

                {g.actions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[11px] font-bold text-slate-400 mb-1.5 inline-flex items-center gap-1">
                      <Zap size={11} /> ما يستطيع فعله
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {g.actions.map((a) => (
                        <label
                          key={a.key}
                          className={`flex items-start gap-2 py-1.5 rounded-lg transition-colors ${
                            canEdit ? "cursor-pointer hover:bg-slate-50 px-2 -mx-2" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={cur.includes(a.key)}
                            onChange={() => toggleKey(page.key, a.key)}
                            disabled={!canEdit || !!a.pending}
                            className="accent-[#1C2D50] cursor-pointer shrink-0 mt-0.5"
                            style={{ width: 15, height: 15 }}
                          />
                          <span className="min-w-0">
                            <span className={`text-[13px] ${
                              a.pending ? "text-slate-400"
                              : a.sensitive ? "text-red-700 font-semibold"
                              : "text-slate-700"
                            }`}>
                              {a.label}
                              {a.pending && (
                                <span className="ms-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                                  قيد الربط
                                </span>
                              )}
                            </span>
                            {a.hint && <span className="block text-[11px] text-slate-400">{a.hint}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {g.fields && g.fields.length > 0 && (
                  <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                    <p className="text-[11px] font-bold text-slate-400 mb-1.5 inline-flex items-center gap-1">
                      <Eye size={11} /> ما يظهر له من الحقول
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {g.fields.map((f) => (
                        <label
                          key={f.key}
                          className={`flex items-start gap-2 py-1 ${canEdit ? "cursor-pointer" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={cur.includes(f.key)}
                            onChange={() => toggleKey(page.key, f.key)}
                            disabled={!canEdit || !!f.pending}
                            className="accent-[#1C2D50] cursor-pointer shrink-0 mt-0.5"
                            style={{ width: 15, height: 15 }}
                          />
                          <span className={`text-[13px] ${
                            f.pending ? "text-slate-400"
                            : f.sensitive ? "text-red-700 font-semibold"
                            : "text-slate-600"
                          }`}>
                            {f.label}
                            {f.pending && (
                              <span className="ms-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                                قيد الربط
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
