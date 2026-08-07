/* تعديل عقد أو حذفه — الحذف يُمنع إن صُرفت عليه خامات. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, num } from "@/lib/server/guard";
import { svcUpdateContract, svcDeleteContract } from "@/lib/server/contracts-core";

export const dynamic = "force-dynamic";

function parseTerms(body: Record<string, unknown>) {
  const raw = Array.isArray(body.terms) ? body.terms : [];
  return raw.map((t: { barcode: unknown; quantity: unknown; unitPrice: unknown }) => ({
    barcode: str(t.barcode, "صنف البند"),
    quantity: num(t.quantity, "كمية البند", { positive: true }),
    unitPrice: num(t.unitPrice ?? 0, "سعر البند", { min: 0 }),
  }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "edit", "تعديل العقود");
    const { id } = await params;
    await svcUpdateContract(caller.db, id, body, body.terms !== undefined ? parseTerms(body) : undefined);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "delete", "حذف العقود");
    const { id } = await params;
    await svcDeleteContract(caller.db, id);
  });
}
