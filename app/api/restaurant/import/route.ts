/* استقبال ملف منصرف المطعم المُعبَّأ وتسجيل عملياته دفعة واحدة. */

import { NextRequest, NextResponse } from "next/server";
import { requireCaller, require_, dateStr, str, ApiError } from "@/lib/server/guard";
import { svcImportRestaurantDispense } from "@/lib/server/restaurant-import-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    // requireCaller يقرأ توكن الهوية من ترويسة Authorization لا من الجسم هنا
    const caller = await requireCaller(req);
    require_(caller, "costs", "out_add", "تسجيل المنصرف");

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("أرفق ملف الإكسل المُعبَّأ");
    const dispenseDate = dateStr(form.get("dispenseDate"), "تاريخ الصرف");
    const departmentName = str(form.get("departmentName"), "القسم");

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await svcImportRestaurantDispense(caller.db, buffer, {
      dispenseDate, departmentName, createdBy: caller.uid,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر الاستيراد" }, { status });
  }
}
