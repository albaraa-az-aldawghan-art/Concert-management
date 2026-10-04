import { api } from "@/lib/api";

export interface CustomerConcertSummary {
  id: string;
  concertNumber: number | null;
  date: string | null;
  createdAt: string | null;
  venueName: string | null;
  peopleCount: string | null;
  status: string;
  price: number;
  paid: number;
  remaining: number;
  refundAmount: number;
  invoiceNumber: string | null;
}

export interface CustomerPaymentSummary {
  id: string;
  concertId: string;
  concertNumber: number | null;
  amount: number;
  method: string;
  date: string;
  createdAt: string | null;
  createdBy: string;
  createdByName: string;
}

export interface ConcertCustomerSummary {
  id: string;
  name: string;
  primaryPhone: string;
  secondaryPhone: string | null;
  source: string | null;
  referralName: string | null;
  notes: string | null;
  firstRegisteredAt: string | null;
  firstCreatedBy: string;
  firstCreatedByName: string;
  lastConcertAt: string | null;
  concertCount: number;
  completedCount: number;
  cancelledCount: number;
  upcomingCount: number;
  totalValue: number;
  totalCollected: number;
  totalRemaining: number;
  totalRefunded: number;
  concerts: CustomerConcertSummary[];
  payments: CustomerPaymentSummary[];
}

export const getConcertCustomers = () => api.get<ConcertCustomerSummary[]>("/api/customers");

export const saveConcertCustomer = (data: {
  id: string; name: string; primaryPhone: string; secondaryPhone: string;
  source: string; referralName: string; notes: string;
}) => api.patch<{ ok: true; linkedConcerts: number }>("/api/customers", data);

