import { NextRequest } from "next/server";
import { requireCaller, requireAdmin, handle } from "@/lib/server/guard";
import { svcDeleteOutgoing } from "@/lib/server/costs-core";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requireAdmin(caller, "حذف عمليات المنصرف");
    const { id } = await params;
    await svcDeleteOutgoing(caller.db, id);
  });
}
