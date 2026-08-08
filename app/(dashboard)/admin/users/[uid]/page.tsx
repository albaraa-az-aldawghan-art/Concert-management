"use client";

/* ملف الموظف: كل ما يملكه موظف واحد معروضاً للأدمن في مكان واحد —
   ما يفتحه، وحفلاته، وعهدته، وكل عملية كتبها في النظام.
   صلاحيته هي صلاحية صفحة الموظفين نفسها: pageKeyFromPath يردّ "users"
   لكل ما يبدأ بـ /admin/users، فلا تنشأ قاعدة وصول ثانية. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers } from "@/lib/firestore/users";
import { getCustomRoles } from "@/lib/firestore/roles";
import { getStaffProfile, StaffProfile } from "@/lib/firestore/staff";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { AppUser, CustomRole } from "@/types";
import { PERMISSION_PAGES, normalizedFeatures, BUILT_IN_ACCESS } from "@/lib/permissions";
import { getRoleLabel, formatDate } from "@/lib/utils";
import {
  ChevronRight, ChevronLeft, Pencil, Trash2, Mail, CalendarDays, Shield, ShieldCheck,
  Lock, Music, Package, AlertTriangle, Activity, ExternalLink, Eye, Settings2,
} from "lucide-react";

/* الأدوار التي يجوز إسنادها — «أدمن» ليس منها عمداً */
const assignable = [
  { value: "warehouse_manager", label: "مدير الموارد" },
  { value: "supervisor",        label: "مشرف" },
  { value: "employee",          label: "موظف" },
  { value: "kitchen",           label: "مطبخ" },
];

/** الأرقام لاتينية في كل الموقع، وبمنزلتين عشريتين كحد أقصى */
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ريال";

export default function StaffProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { appUser, feat } = useAuth();
  const { showToast } = useToast();
  const canEdit = feat("users", "edit");
  const canDelete = feat("users", "delete");

  const [user, setUser] = useState<AppUser | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({ name: "", newPassword: "", role: "" });
  const [kindFilter, setKindFilter] = useState("");
  const [limit, setLimit] = useState(25);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  async function load() {
    setLoading(true);
    const [users, roles, prof] = await Promise.all([
      getAllUsers(),
      getCustomRoles().catch(() => []),
      getStaffProfile(uid),
    ]);
    setUser(users.find((u) => u.uid === uid) ?? null);
    setCustomRoles(roles);
    setProfile(prof);
    setLoading(false);
  }

  const roleValueOf = (u: AppUser) =>
    u.role === "custom" && u.customRoleId ? `custom::${u.customRoleId}` : u.role;

  const currentRole =
    user?.role === "custom" ? customRoles.find((r) => r.id === user.customRoleId) ?? null : null;
  const roleName = user
    ? user.role === "custom" ? currentRole?.name ?? "دور محذوف" : getRoleLabel(user.role)
    : "";

  /* ما يفتحه هذا الموظف: الأدمن كل شيء، والمخصص من صلاحياته،
     والأدوار الجاهزة من قائمتها المثبَّتة */
  const access = useMemo(() => {
    if (!user) return { pages: [] as { label: string; href: string; feats: string[] | null }[], all: false };
    if (user.role === "admin") return { pages: [], all: true };
    if (user.role === "custom") {
      const pages = PERMISSION_PAGES.map((p) => {
        const f = normalizedFeatures(currentRole, p.key);
        if (f === null) return null;
        return {
          label: p.label,
          href: p.href,
          feats: p.features.filter((x) => f.includes(x.key)).map((x) => x.label),
        };
      }).filter(Boolean) as { label: string; href: string; feats: string[] }[];
      return { pages, all: false };
    }
    return {
      pages: (BUILT_IN_ACCESS[user.role] ?? []).map((p) => ({ ...p, feats: null })),
      all: false,
    };
  }, [user, currentRole]);

  /* أرقام مختصرة تُقرأ قبل التفصيل */
  const stats = useMemo(() => {
    if (!profile) return null;
    const spent = profile.activity
      .filter((a) => a.kind === "outgoing")
      .reduce((s, a) => s + (a.amount ?? 0), 0);
    const openCustody = profile.custody.filter((c) => c.returnStatus === "pending");
    return {
      ops: profile.activity.length,
      spent,
      concerts: new Set([...profile.asEmployee, ...profile.asSupervisor].map((c) => c.id)).size,
      custody: openCustody.length,
      reported: profile.reported.length,
      last: profile.activity[0]?.at ?? null,
    };
  }, [profile]);

  const kinds = useMemo(() => {
    if (!profile) return [];
    const m = new Map<string, { label: string; n: number }>();
    for (const a of profile.activity) {
      const cur = m.get(a.kind);
      m.set(a.kind, { label: a.kindLabel, n: (cur?.n ?? 0) + 1 });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [profile]);

  const shownActivity = useMemo(() => {
    if (!profile) return [];
    const rows = kindFilter ? profile.activity.filter((a) => a.kind === kindFilter) : profile.activity;
    return rows.slice(0, limit);
  }, [profile, kindFilter, limit]);

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

  const concerts = [
    ...profile!.asSupervisor.map((c) => ({ c, as: "مشرف" })),
    ...profile!.asEmployee.filter((e) => !profile!.asSupervisor.some((s) => s.id === e.id))
      .map((c) => ({ c, as: "موظف" })),
  ].sort((a, b) => (b.c.date?.seconds ?? 0) - (a.c.date?.seconds ?? 0));

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#1C2D50] transition-colors"
      >
        <ChevronRight size={16} />
        الموظفون
      </Link>

      {/* ── من هو، وبأي دور ── */}
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
                variant="secondary" size="sm" onClick={() => setShowDelete(true)}
                className="gap-1.5 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> حذف
              </Button>
            )}
          </div>
        </div>

        {/* أرقامه */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-5 border-t border-slate-100">
            {[
              { k: "عملية في النظام", v: String(stats.ops) },
              { k: "قيمة ما صرفه", v: money(stats.spent) },
              { k: "حفلة", v: String(stats.concerts) },
              { k: "مادة في عهدته", v: String(stats.custody) },
              { k: "مفقود بلّغ عنه", v: String(stats.reported) },
            ].map((s) => (
              <div key={s.k} className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-slate-400">{s.k}</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5 tabular-nums">{s.v}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {profile!.blocked.length > 0 && (
        <Card className="bg-amber-50 border-amber-100">
          <p className="text-sm text-amber-800">
            صلاحيتك لا تسمح بقراءة: {profile!.blocked.join("، ")} — ما يظهر أدناه ناقص بقدرها.
          </p>
        </Card>
      )}

      {/* ── ما يفتحه هذا الموظف ── */}
      <Card>
        <h3 className="font-bold text-slate-800 mb-1">ما يفتحه هذا الموظف</h3>
        <p className="text-xs text-slate-400 mb-4">
          الصفحات التي يراها بدوره — اضغط أياً منها لتفتحها أنت بصلاحيتك
        </p>

        {access.all ? (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
            حساب أدمن — يفتح كل صفحة في النظام ولا تُقيَّد صلاحياته
          </div>
        ) : access.pages.length === 0 ? (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
            هذا الدور لا يفتح أي صفحة — سيسجّل الموظف دخوله ولن يرى شيئاً. أسند له دوراً أو امنحه صلاحيات.
          </div>
        ) : (
          <div className="space-y-2">
            {access.pages.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="flex items-start justify-between gap-3 bg-slate-50 hover:bg-slate-100 rounded-xl px-4 py-3 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{p.label}</p>
                  {p.feats === null ? (
                    <p className="text-[11px] text-slate-400 mt-0.5">دور جاهز — صلاحياته مثبَّتة في النظام</p>
                  ) : p.feats.length === 0 ? (
                    <p className="text-[11px] text-slate-400 mt-0.5 inline-flex items-center gap-1">
                      <Eye size={11} /> عرض فقط، بلا إضافة أو تعديل
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-0.5 inline-flex items-start gap-1">
                      <Settings2 size={11} className="mt-0.5 shrink-0" />
                      <span>{p.feats.join(" · ")}</span>
                    </p>
                  )}
                </div>
                <ExternalLink size={14} className="text-slate-300 group-hover:text-[#1C2D50] shrink-0 mt-0.5" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ── حفلاته ── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Music size={16} className="text-[#1C2D50]" />
          <h3 className="font-bold text-slate-800">حفلاته</h3>
          <span className="text-xs text-slate-400">{concerts.length}</span>
        </div>
        {concerts.length === 0 ? (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
            لم يُسند إلى أي حفلة
          </p>
        ) : (
          <div className="space-y-2">
            {concerts.map(({ c, as }) => (
              <Link
                key={c.id}
                href={`/admin/concerts/${c.id}`}
                className="flex items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100 rounded-xl px-4 py-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{c.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatDate(c.date)}
                    {c.venueName ? ` · ${c.venueName}` : ""} · بصفته {as}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={c.status} />
                  <ChevronLeft size={14} className="text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ── عهدته ── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Package size={16} className="text-[#1C2D50]" />
          <h3 className="font-bold text-slate-800">عهدته</h3>
          <span className="text-xs text-slate-400">
            {profile!.custody.filter((c) => c.returnStatus === "pending").length} لم تُرجَع بعد
          </span>
        </div>
        {profile!.custody.length === 0 ? (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
            لا مواد مسندة إليه
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-right font-medium py-2">المادة</th>
                  <th className="text-right font-medium py-2">الحفلة</th>
                  <th className="text-right font-medium py-2">العدد</th>
                  <th className="text-right font-medium py-2">القيمة</th>
                  <th className="text-right font-medium py-2">الإرجاع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {profile!.custody.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5 font-medium text-slate-700">{i.itemName}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{i.concertName ?? "—"}</td>
                    <td className="py-2.5 tabular-nums">{i.count}</td>
                    <td className="py-2.5 tabular-nums text-slate-600">
                      {i.totalCost ? money(i.totalCost) : "—"}
                    </td>
                    <td className="py-2.5">
                      <Badge
                        variant={
                          i.returnStatus === "confirmed" ? "green"
                          : i.returnStatus === "has_missing" ? "red"
                          : "gray"
                        }
                      >
                        {i.returnStatus === "confirmed" ? "أُرجعت"
                          : i.returnStatus === "has_missing" ? "بها مفقودات"
                          : "في عهدته"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── المفقودات التي بلّغ عنها ── */}
      {profile!.reported.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="font-bold text-slate-800">مفقودات بلّغ عنها</h3>
            <span className="text-xs text-slate-400">{profile!.reported.length}</span>
          </div>
          <div className="space-y-2">
            {profile!.reported.map((m) => (
              <div key={m.id} className="bg-slate-50 rounded-xl px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-700">{m.itemName}</span>
                <span className="text-slate-400"> × {m.missingCount} — {m.concertName}</span>
                <span className="text-[11px] text-slate-300 float-left">{formatDate(m.reportedAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── سجل نشاطه ── */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Activity size={16} className="text-[#1C2D50]" />
          <h3 className="font-bold text-slate-800">سجل نشاطه</h3>
          <span className="text-xs text-slate-400">{profile!.activity.length} عملية</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">كل عملية كتبها هذا الموظف في النظام، الأحدث أولاً</p>

        {profile!.activity.length === 0 ? (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
            لم ينفّذ أي عملية بعد
          </p>
        ) : (
          <>
            <div className="flex gap-1.5 flex-wrap mb-3">
              <button
                onClick={() => { setKindFilter(""); setLimit(25); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  kindFilter === "" ? "bg-[#1C2D50] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                الكل ({profile!.activity.length})
              </button>
              {kinds.map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => { setKindFilter(k); setLimit(25); }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    kindFilter === k ? "bg-[#1C2D50] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {v.label} ({v.n})
                </button>
              ))}
            </div>

            <div className="divide-y divide-slate-50">
              {shownActivity.map((a) => {
                const row = (
                  <div className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{a.text}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {a.kindLabel}
                        {a.at ? ` · ${formatDate(a.at)}` : ""}
                      </p>
                    </div>
                    {a.amount !== null && (
                      <span className="text-sm font-semibold text-slate-700 tabular-nums shrink-0">
                        {money(a.amount)}
                      </span>
                    )}
                  </div>
                );
                return a.href ? (
                  <Link key={a.id} href={a.href} className="block hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                    {row}
                  </Link>
                ) : (
                  <div key={a.id}>{row}</div>
                );
              })}
            </div>

            {(kindFilter ? profile!.activity.filter((a) => a.kind === kindFilter).length : profile!.activity.length) > limit && (
              <button
                onClick={() => setLimit((l) => l + 50)}
                className="w-full mt-3 py-2 text-xs font-semibold text-[#1C2D50] hover:bg-slate-50 rounded-xl transition-colors"
              >
                عرض المزيد
              </button>
            )}
          </>
        )}
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
