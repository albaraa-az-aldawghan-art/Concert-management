export interface ContractDaySummaryInput {
  contractId?: unknown;
  date?: unknown;
  totals?: {
    sales?: unknown;
    collected?: unknown;
    cost?: unknown;
    expenses?: unknown;
  } | null;
  postedPaymentIds?: unknown;
}

export interface ContractOperatingSummary {
  contractId: string;
  days: number;
  sales: number;
  collected: number;
  postedCollected: number;
  cost: number;
  expenses: number;
  lastActivityDate: string | null;
}

const r2 = (value: number) => Math.round(value * 100) / 100;
const amount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** يجمع تشغيل العقود من الأيام المسجّلة. قيمة الاتفاق نفسها لا تدخل هنا
 * لأنها معنى مختلف عن المبيعات الفعلية الناتجة من الجدول اليومي. */
export function summarizeContractDays(days: ContractDaySummaryInput[]): Record<string, ContractOperatingSummary> {
  const result: Record<string, ContractOperatingSummary> = {};
  for (const day of days) {
    const contractId = typeof day.contractId === "string" ? day.contractId : "";
    if (!contractId) continue;
    const current = result[contractId] ?? {
      contractId,
      days: 0,
      sales: 0,
      collected: 0,
      postedCollected: 0,
      cost: 0,
      expenses: 0,
      lastActivityDate: null,
    };
    const totals = day.totals ?? {};
    const collected = amount(totals.collected);
    current.days += 1;
    current.sales = r2(current.sales + amount(totals.sales));
    current.collected = r2(current.collected + collected);
    current.cost = r2(current.cost + amount(totals.cost));
    current.expenses = r2(current.expenses + amount(totals.expenses));
    if (Array.isArray(day.postedPaymentIds) && day.postedPaymentIds.length > 0) {
      current.postedCollected = r2(current.postedCollected + collected);
    }
    const date = typeof day.date === "string" ? day.date : "";
    if (date && (!current.lastActivityDate || date > current.lastActivityDate)) current.lastActivityDate = date;
    result[contractId] = current;
  }
  return result;
}
