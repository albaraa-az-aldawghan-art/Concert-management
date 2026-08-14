/* ترحيل تحصيل الشهر دفعةً على العقد، والتراجع عنه. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str } from "@/lib/server/guard";
import { svcPostMonthCollections, svcUnpostMonthCollections } from "@/lib/server/contract-ledger-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "ledger_post", "ترحيل التحصيل");
    const { id } = await params;
    return svcPostMonthCollections(caller.db, id, str(body.month, "الشهر", { max: 7 }), caller.uid);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "ledger_post", "التراجع عن الترحيل");
    const { id } = await params;
    return svcUnpostMonthCollections(caller.db, id, req.nextUrl.searchParams.get("month") ?? "");
  });
}
