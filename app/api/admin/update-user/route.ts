/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { ApiError, handle, requireCaller, require_, str } from "@/lib/server/guard";

/* الأدوار التي يجوز إسنادها من الواجهة. «admin» ليس منها عمداً:
   ترقية حساب إلى أدمن أو تنزيله تجاوزٌ للصلاحيات، فتبقى خارج هذا المسار. */
const ASSIGNABLE = ["warehouse_manager", "supervisor", "employee", "kitchen", "custom"];

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "users", "edit", "تعديل بيانات الموظفين");

    const targetUid = str(body.targetUid, "معرّف الموظف");
    const { newPassword, newName, newRole, newCustomRoleId } = body;

    const targetRef = caller.db.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new ApiError("الموظف غير مسجّل", 404);
    const target = targetSnap.data() as { role: string };

    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 6) {
        throw new ApiError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      }
      await getAdminAuth().updateUser(targetUid, { password: newPassword });
    }

    /* التحديثات على مستند الموظف تُجمع في كتابة واحدة */
    const patch: Record<string, unknown> = {};
    if (newName) patch.name = str(newName, "الاسم");

    if (newRole !== undefined) {
      /* حساب الأدمن لا يُغيَّر دوره من هنا، ولا يُمنح أحد دور الأدمن،
         ولا يعدّل أحد دور نفسه — ثلاثتها أبواب تصعيد صلاحيات */
      if (target.role === "admin") throw new ApiError("لا يُغيَّر دور حساب الأدمن من هذه الصفحة", 403);
      if (caller.uid === targetUid) throw new ApiError("لا يمكنك تغيير دور حسابك أنت", 403);
      if (!ASSIGNABLE.includes(newRole)) throw new ApiError("دور غير معروف");

      if (newRole === "custom") {
        const roleId = str(newCustomRoleId, "الدور المخصص");
        const roleSnap = await caller.db.collection("custom_roles").doc(roleId).get();
        if (!roleSnap.exists) throw new ApiError("الدور المخصص غير موجود");
        patch.role = "custom";
        patch.customRoleId = roleId;
      } else {
        patch.role = newRole;
        patch.customRoleId = null;
      }
    }

    if (Object.keys(patch).length > 0) await targetRef.update(patch);
    return { ok: true };
  });
}
