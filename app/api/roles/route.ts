import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { ApiError, handle, requireCaller, require_, str } from "@/lib/server/guard";
import { PERMISSION_CATALOG } from "@/lib/permissions-catalog";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const id = body.id == null ? null : str(body.id, "معرّف الدور");
    if (id?.includes("/")) throw new ApiError("معرّف غير صحيح");
    require_(caller, "users", id ? "roles_edit" : "roles_create", "إدارة الأدوار");
    const data = body.data;
    if (!data || typeof data !== "object") throw new ApiError("بيانات الدور غير صحيحة");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = str(data.name, "اسم الدور", { max: 100 });
    if (data.permissions !== undefined) {
      if (!data.permissions || typeof data.permissions !== "object" || Array.isArray(data.permissions)) throw new ApiError("صلاحيات غير صحيحة");
      for (const [page, value] of Object.entries(data.permissions)) {
        const definition = PERMISSION_CATALOG.find((p) => p.key === page);
        if (!definition) throw new ApiError("صفحة غير معروفة");
        const keys = definition.groups.flatMap((g) => [...g.actions, ...(g.fields ?? [])]).map((f) => f.key);
        if (value !== "view" && value !== "manage" && (!Array.isArray(value) || value.some((v) => !keys.includes(v)))) throw new ApiError("صلاحية غير معروفة");
      }
      patch.permissions = data.permissions;
    }
    const ref = id ? caller.db.collection("custom_roles").doc(id) : caller.db.collection("custom_roles").doc();
    if (id) await ref.update(patch);
    else {
      if (!patch.name) throw new ApiError("اسم الدور مطلوب");
      await ref.create({ ...patch, permissions: patch.permissions ?? {}, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
    }
    return { id: ref.id };
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "users", "roles_delete", "حذف الأدوار");
    const id = str(req.nextUrl.searchParams.get("id"), "معرّف الدور");
    if (id.includes("/")) throw new ApiError("معرّف غير صحيح");
    const ref = caller.db.collection("custom_roles").doc(id);
    await caller.db.runTransaction(async (tx) => {
      const role = await tx.get(ref);
      if (!role.exists) throw new ApiError("الدور غير موجود", 404);
      if (role.data()?.builtIn || id.startsWith("role_")) throw new ApiError("لا يمكن حذف دور جاهز");
      const users = await tx.get(caller.db.collection("users").where("customRoleId", "==", id).limit(1));
      if (!users.empty) throw new ApiError("لا يمكن حذف الدور — مرتبط بمستخدمين");
      tx.delete(ref);
    });
    return { id };
  });
}
