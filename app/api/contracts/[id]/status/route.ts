/* إلغاء العقد أو إتمامه. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, ApiError } from "@/lib/server/guard";
import { svcCancelContract, svcCompleteContract } from "@/lib/server/contracts-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const { id } = await params;
    const action = str(body.action, "الإجراء");

    if (action === "cancel") {
      require_(caller, "contracts", "cancel", "إلغاء العقود");
      await svcCancelContract(caller.db, id, optStr(body.reason, 300) ?? "");
      return;
    }
    if (action === "complete") {
      require_(caller, "contracts", "edit", "إتمام العقود");
      await svcCompleteContract(caller.db, id);
      return;
    }
    throw new ApiError("إجراء غير معروف");
  });
}
