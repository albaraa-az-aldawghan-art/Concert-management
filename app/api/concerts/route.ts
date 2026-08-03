import { NextRequest } from "next/server";
import { requireCaller, require_, handle, ApiError } from "@/lib/server/guard";
import { svcCreateConcert } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** إنشاء حفلة — الرقم التسلسلي يُولَّد على الخادم داخل معاملة */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "create", "إنشاء الحفلات");
    if (!body.name || typeof body.name !== "string") throw new ApiError("اسم الحفلة مطلوب");
    if (!body.date) throw new ApiError("تاريخ الحفلة مطلوب");
    return svcCreateConcert(caller.db, body.concert ?? body, caller.uid);
  });
}
