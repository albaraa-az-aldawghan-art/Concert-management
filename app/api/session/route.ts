import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller } from "@/lib/server/guard";
import { activityContext } from "@/lib/server/activity-context";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    const body = await req.json();
    if (body.action !== "signin" && body.action !== "signout") throw new ApiError("إجراء غير صحيح");
    await activityContext.getStore()?.ref?.update({
      action: body.action === "signin" ? "تسجيل الدخول" : "طلب تسجيل الخروج",
      targetId: caller.uid,
    });
  });
}
