/* التعاقدات: إنشاء عقد بمدة وبنود من منتجات البيع. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr } from "@/lib/server/guard";
import { svcCreateContract } from "@/lib/server/contracts-core";

export const dynamic = "force-dynamic";

function parseTerms(body: Record<string, unknown>) {
  const raw = Array.isArray(body.terms) ? body.terms : [];
  return raw.map((t: { barcode: unknown; quantity: unknown; unitPrice: unknown }) => ({
    barcode: str(t.barcode, "صنف البند"),
    quantity: num(t.quantity, "كمية البند", { positive: true }),
    unitPrice: num(t.unitPrice ?? 0, "سعر البند", { min: 0 }),
  }));
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "create", "إنشاء العقود");
    return svcCreateContract(caller.db, {
      name: str(body.name, "اسم الجهة", { max: 120 }),
      clientName: optStr(body.clientName),
      clientPhone: optStr(body.clientPhone, 20),
      startDate: dateStr(body.startDate, "تاريخ بداية العقد"),
      endDate: dateStr(body.endDate, "تاريخ نهاية العقد"),
      vatRate: body.vatRate != null ? num(body.vatRate, "نسبة الضريبة", { min: 0 }) : null,
      totalValue: body.totalValue != null ? num(body.totalValue, "قيمة العقد", { min: 0 }) : null,
      terms: parseTerms(body),
      notes: optStr(body.notes, 500),
      createdBy: caller.uid,
    });
  });
}
