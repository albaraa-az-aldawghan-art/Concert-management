import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { PermissionPage } from "@/types";
import { roleDocIdFor } from "@/lib/permissions";
import type { Firestore } from "firebase-admin/firestore";

/* ═══════════════════════════════════════════════════════════════
   حارس الطلبات — كل مسار في الـAPI يمرّ من هنا.

   قواعد Firestore تحرس المستندات لا المنطق: تسمح بالكتابة على
   cost_items لمن يملك الصلاحية، لكنها لا تعرف أن totalIn يجب أن يزيد
   بمقدار الوارد بالضبط. فمن يملك بيانات الدخول كان يستطيع كتابة أي
   رقم مباشرةً. الآن الكتابة كلها هنا: الهوية تُتحقَّق من الرمز،
   والصلاحية من مستند المستخدم، والحساب من الكود لا من العميل.
   ═══════════════════════════════════════════════════════════════ */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Caller {
  uid: string;
  role: string;
  db: Firestore;
  /** هل يملك هذه الميزة داخل الصفحة؟ المدير يملك كل شيء دائماً */
  feat: (page: PermissionPage, feature: string) => boolean;
  /** هل يفتح هذه الصفحة أصلاً؟ العرض وحده يكفي — لا تلزم ميزة */
  can: (page: PermissionPage) => boolean;
  isAdmin: boolean;
}

/** الرمز يُقرأ من ترويسة Authorization، ويُقبل من الجسم للمسارات القديمة */
function tokenFrom(req: NextRequest, body?: Record<string, unknown>): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const fromBody = body?.callerIdToken;
  return typeof fromBody === "string" ? fromBody : null;
}

export async function requireCaller(
  req: NextRequest,
  body?: Record<string, unknown>
): Promise<Caller> {
  const token = tokenFrom(req, body);
  if (!token) throw new ApiError("مطلوب تسجيل الدخول", 401);

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    throw new ApiError("انتهت صلاحية الجلسة — أعد تسجيل الدخول", 401);
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) throw new ApiError("المستخدم غير مسجّل", 403);

  const user = userSnap.data() as { role: string; customRoleId?: string | null };
  const isAdmin = user.role === "admin";

  /* الدور مستند واحد سواء كان مخصصاً أو جاهزاً (مشرف، موظف…):
     roleDocIdFor يترجم دور الحساب إلى معرّف مستنده، فيقرأ الخادم
     الصلاحيات نفسها التي يقرأها المتصفح — مصدر واحد لا اثنان. */
  let perms: Record<string, string[] | string> = {};
  const roleDocId = roleDocIdFor(user);
  if (roleDocId) {
    const roleSnap = await db.collection("custom_roles").doc(roleDocId).get();
    perms = (roleSnap.data()?.permissions ?? {}) as Record<string, string[] | string>;
  }

  function feat(page: PermissionPage, feature: string): boolean {
    if (isAdmin) return true;
    const raw = perms[page];
    if (raw === undefined || raw === null) return false;
    if (Array.isArray(raw)) return raw.includes(feature);
    return raw === "manage"; // الصيغة القديمة
  }

  function can(page: PermissionPage): boolean {
    if (isAdmin) return true;
    return perms[page] !== undefined && perms[page] !== null;
  }

  return { uid, role: user.role, db, feat, can, isAdmin };
}

/** يرمي إن لم يملك المستخدم الميزة — الرسالة تذكر ما ينقصه */
export function require_(caller: Caller, page: PermissionPage, feature: string, label: string) {
  if (!caller.feat(page, feature)) {
    throw new ApiError(`لا تملك صلاحية ${label}`, 403);
  }
}

/** يرمي إن لم يكن للمستخدم وصول إلى الصفحة أصلاً */
export function requirePage(caller: Caller, page: PermissionPage, label: string) {
  if (!caller.can(page)) throw new ApiError(`لا تملك صلاحية ${label}`, 403);
}

export function requireAdmin(caller: Caller, label: string) {
  if (!caller.isAdmin) throw new ApiError(`${label} للمدير فقط`, 403);
}

/** يغلّف المسار: يحوّل الأخطاء إلى ردود JSON مفهومة بدل انهيار 500 */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── أدوات تحقّق من المدخلات ────────────────────────────────── */

export function num(v: unknown, field: string, { min = -Infinity, positive = false } = {}): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!isFinite(n)) throw new ApiError(`${field}: قيمة رقمية غير صحيحة`);
  if (positive && n <= 0) throw new ApiError(`${field}: يجب أن يكون أكبر من صفر`);
  if (n < min) throw new ApiError(`${field}: أقل من الحد المسموح`);
  return n;
}

export function str(v: unknown, field: string, { required = true, max = 300 } = {}): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new ApiError(`${field}: مطلوب`);
  if (s.length > max) throw new ApiError(`${field}: أطول من المسموح`);
  return s;
}

export function optStr(v: unknown, max = 300): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

export function dateStr(v: unknown, field: string, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new ApiError(`${field}: مطلوب`);
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(`${field}: صيغة التاريخ غير صحيحة`);
  return s;
}
