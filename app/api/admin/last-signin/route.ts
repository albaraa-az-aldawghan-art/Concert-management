/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { ApiError, handle, requireCaller, requirePage } from "@/lib/server/guard";

/* آخر تسجيل دخول محفوظ في Firebase Auth لا في Firestore، والمتصفح لا يصل
   إليه — فيُقرأ هنا بـ Admin SDK. وهو المقياس الصحيح للخمول: الأدوار
   القارئة (مشرف، موظف، مطبخ) لا تكتب شيئاً، فعدد عملياتها صفر مهما
   دخلت يومياً. */

/** getUsers يقبل 100 معرّف في النداء الواحد */
const CHUNK = 100;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    requirePage(caller, "users", "عرض الموظفين");

    const uids = body.uids;
    if (!Array.isArray(uids)) throw new ApiError("قائمة المعرّفات مطلوبة");
    const clean = uids.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (clean.length === 0) return { lastSignIn: {} };
    if (clean.length > 1000) throw new ApiError("عدد المعرّفات كبير جداً");

    const auth = getAdminAuth();
    const lastSignIn: Record<string, string | null> = {};

    for (let i = 0; i < clean.length; i += CHUNK) {
      const slice = clean.slice(i, i + CHUNK);
      const res = await auth.getUsers(slice.map((uid) => ({ uid })));
      for (const u of res.users) {
        lastSignIn[u.uid] = u.metadata.lastSignInTime ?? null;
      }
      /* حساب مصادقة محذوف مع بقاء مستنده — يُردّ null لا يُحذف من الرد،
         فتميّز الواجهة «لم يسجّل دخولاً» عن «لم يُسأل عنه» */
      for (const nf of res.notFound) {
        if ("uid" in nf && typeof nf.uid === "string") lastSignIn[nf.uid] = null;
      }
    }

    return { lastSignIn };
  });
}
