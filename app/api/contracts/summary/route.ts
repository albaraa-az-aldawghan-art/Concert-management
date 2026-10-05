import { NextRequest } from "next/server";
import { handle, require_, requireCaller, requirePage } from "@/lib/server/guard";
import { summarizeContractDays } from "@/lib/contract-operating-summary";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requirePage(caller, "contracts", "عرض التعاقدات");
    require_(caller, "contracts", "cf_value", "عرض أرقام التعاقدات");
    const snapshot = await caller.db.collection("contract_days").get();
    return summarizeContractDays(snapshot.docs.map((doc) => doc.data()));
  });
}
