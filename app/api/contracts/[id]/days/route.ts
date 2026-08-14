/* الجدول اليومي للعقد: قراءة شهر وحفظ يوم. */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr, num, dateStr, ApiError } from "@/lib/server/guard";
import { svcSaveContractDay, svcContractMonth } from "@/lib/server/contract-ledger-core";

export const dynamic = "force-dynamic";

/** GET ?month=yyyy-mm — الشهر كله بأيامه وملخصه */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "contracts", "ledger_view", "عرض الجدول اليومي");
    const { id } = await params;
    const month = req.nextUrl.searchParams.get("month") ?? "";
    return svcContractMonth(caller.db, id, month);
  });
}

/** PUT — حفظ يوم كاملاً. الجسم حالة اليوم لا فرقها، فإعادة الإرسال
 *  تُصحّح ولا تُضاعف. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "contracts", "ledger_edit", "تسجيل الجدول اليومي");
    const { id } = await params;

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) throw new ApiError("أضف صنفاً واحداً على الأقل");
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      barcode: str(l.barcode, "الصنف"),
      supplied: num(l.supplied ?? 0, "المورَّد", { min: 0 }),
      damaged: num(l.damaged ?? 0, "التالف", { min: 0 }),
      remaining: num(l.remaining ?? 0, "المتبقي", { min: 0 }),
    }));

    const rawCollections = (body.collections ?? {}) as Record<string, unknown>;
    const collections = Object.fromEntries(
      ["bank_transfer", "mada", "visa", "cash"].map((m) => [m, num(rawCollections[m] ?? 0, "التحصيل", { min: 0 })])
    );

    const expenses = (Array.isArray(body.expenses) ? body.expenses : []).map((e: Record<string, unknown>) => ({
      key: str(e.key, "بند المصروف"),
      amount: num(e.amount ?? 0, "مبلغ المصروف", { min: 0 }),
    }));

    return svcSaveContractDay(caller.db, {
      contractId: id,
      date: dateStr(body.date, "تاريخ اليوم"),
      lines,
      collections,
      expenses,
      custody: body.custody != null ? num(body.custody, "العهدة", { min: 0 }) : null,
      notes: optStr(body.notes, 500),
      uid: caller.uid,
    });
  });
}
