import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr } from "@/lib/server/guard";
import { svcCancelConcert } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** إلغاء الحفلة: يُفرج عن الموارد ويُسجَّل السبب والمبلغ المسترد */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "cancel", "إلغاء الحفلات");
    const { id } = await params;
    await svcCancelConcert(caller.db, id, {
      reason: str(body.reason, "سبب الإلغاء", { required: false }),
      refundAmount: body.refundAmount != null ? Number(body.refundAmount) : null,
      refundDate: optStr(body.refundDate),
      refundMethod: optStr(body.refundMethod),
    });
  });
}
