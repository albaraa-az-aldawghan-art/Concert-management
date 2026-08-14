/* إعداد الجدول اليومي: بنود المصروف ووسمها، والعهدة، والأقسام. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num } from "@/lib/server/guard";
import { svcSetLedgerConfig } from "@/lib/server/contract-ledger-core";
import type { ContractExpenseKind } from "@/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "ledger_config", "إعداد الجدول اليومي");
    const { id } = await params;

    const expenseLines = (Array.isArray(body.expenseLines) ? body.expenseLines : []).map(
      (l: Record<string, unknown>) => ({
        key: str(l.key, "مفتاح بند المصروف", { max: 40 }),
        label: str(l.label, "اسم بند المصروف", { max: 60 }),
        kind: str(l.kind, "وسم بند المصروف") as ContractExpenseKind,
      })
    );

    await svcSetLedgerConfig(caller.db, id, {
      enabled: body.enabled !== false,
      expenseLines,
      defaultCustody: num(body.defaultCustody ?? 0, "العهدة المبدئية", { min: 0 }),
      sectionIds: (Array.isArray(body.sectionIds) ? body.sectionIds : []).map((s: unknown) => str(s, "القسم")),
      departmentName: optStr(body.departmentName, 60),
    });
  });
}
