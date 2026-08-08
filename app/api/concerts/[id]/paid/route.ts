import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcMarkPaid } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** إتمام الحفلة بعد سداد كامل المبلغ */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "mark_paid", "تعليم الحفلة مدفوعة");
    const { id } = await params;
    await svcMarkPaid(caller.db, id, caller.uid);
  });
}
