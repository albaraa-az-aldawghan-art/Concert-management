import type { ConcertPayment, PaymentMethod } from "@/types";

export interface FinancePayment {
  id: string;
  concertId: string;
  date: string | null;
  amountHalalas: number;
  method: PaymentMethod | null;
  cardType: ConcertPayment["cardType"];
  bankName: string | null;
  senderName: string | null;
  receiverName: string | null;
}

export interface FinancePaymentReport {
  count: number;
  totalHalalas: number;
  payments: FinancePayment[] | null;
}
