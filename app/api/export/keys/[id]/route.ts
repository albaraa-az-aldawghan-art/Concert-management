/* إبطال مفتاح رابط دائم — يتوقف الرابط فوراً. */

import { NextRequest } from "next/server";
import { requireCaller, requireAdmin, handle } from "@/lib/server/guard";
import { revokeExportKey } from "@/lib/server/export-keys";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requireAdmin(caller, "إبطال روابط التصدير");
    const { id } = await params;
    await revokeExportKey(caller.db, id);
  });
}
