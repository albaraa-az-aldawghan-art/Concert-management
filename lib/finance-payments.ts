export interface FinancePayment {
  id: string;
  concertId: string;
  date: string | null;
  amountHalalas: number;
}

export interface FinancePaymentReport {
  count: number;
  totalHalalas: number;
  payments: FinancePayment[] | null;
}
