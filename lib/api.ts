import { auth } from "@/lib/firebase";

/* ═══════════════════════════════════════════════════════════════
   جسر العميل إلى الخادم.

   كل كتابة تمسّ المخزون أو المال تمرّ من هنا: يُرفق رمز الجلسة،
   ويُعاد خطأ الخادم كما هو بالعربية بدل «حدث خطأ» المبهم.

   الرمز يُطلب طازجاً عند كل نداء — Firebase يعيد المخزّن ما لم يقترب
   انتهاؤه، فلا كلفة على الأداء، ولا جلسة منتهية تُسقط عملية.
   ═══════════════════════════════════════════════════════════════ */

async function idToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("انتهت الجلسة — أعد تسجيل الدخول");
  return user.getIdToken();
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await idToken();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* رد بلا جسم — يُعالَج بالحالة وحدها */
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      (res.status === 401 ? "انتهت الجلسة — أعد تسجيل الدخول" : "تعذّر إتمام العملية");
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => call<T>("GET", path),
  post: <T = { ok: true }>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
  patch: <T = { ok: true }>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {}),
  del: <T = { ok: true }>(path: string) => call<T>("DELETE", path),
};
