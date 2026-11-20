import type { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, requirePage } from "@/lib/server/guard";
import { validCalendarValue } from "@/lib/latin-fields";
import type { FinancePayment, FinancePaymentReport } from "@/lib/finance-payments";

const MAX_PAYMENTS = 10_000;
const roundMoney = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 2 });

export async function GET(request: NextRequest) {
  const response = await handle(async (): Promise<FinancePaymentReport> => {
    const caller = await requireCaller(request);
    requirePage(caller, "finances", "عرض القائمة المالية");

    const showDetails = caller.feat("finances", "table_view") && caller.feat("finances", "f_paid");
    if (!showDetails && !caller.feat("finances", "f_collected")) {
      throw new ApiError("لا تملك صلاحية عرض المحصّل", 403);
    }

    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!validCalendarValue(from, "date") || !validCalendarValue(to, "date")) {
      throw new ApiError("أدخل تاريخًا صحيحًا للفترة");
    }
    if (from && to && from > to) throw new ApiError("تاريخ البداية يجب أن يسبق تاريخ النهاية");

    let query: FirebaseFirestore.Query = caller.db.collection("concert_payments");
    if (from) query = query.where("date", ">=", from);
    if (to) query = query.where("date", "<=", to);
    const snapshot = await query.select("concertId", "date", "amount").limit(MAX_PAYMENTS + 1).get();
    if (snapshot.size > MAX_PAYMENTS) throw new ApiError("عدد الدفعات كبير. اختر فترة أقصر لعرض الإجمالي كاملًا.", 422);

    const payments: FinancePayment[] | null = showDetails ? [] : null;
    let totalHalalas = 0;
    let count = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const date = typeof data.date === "string" && data.date && validCalendarValue(data.date, "date") ? data.date : null;
      if ((from || to) && date === null) continue;
      const amountHalalas = typeof data.amount === "number" ? Math.round(Number(roundMoney.format(data.amount)) * 100) : NaN;
      if (!Number.isSafeInteger(amountHalalas) || !Number.isSafeInteger(totalHalalas + amountHalalas)) {
        throw new ApiError("تعذّر احتساب الإجمالي بسبب مبلغ غير صالح في سجل الدفعات. راجع الدفعات المسجلة.", 422);
      }
      totalHalalas += amountHalalas;
      count++;
      payments?.push({ id: doc.id, concertId: typeof data.concertId === "string" ? data.concertId : "", date, amountHalalas });
    }
    payments?.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
    return { count, totalHalalas, payments };
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
