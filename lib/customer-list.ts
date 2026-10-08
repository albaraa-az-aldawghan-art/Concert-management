import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { getWeekBounds } from "./date-period";
import { eventDateString, riyadhDateString } from "./event-date";

export const CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_CONCERT_PAGE_SIZE = 10;

export interface CustomerFilters {
  search: string;
  period: "" | "week" | "next-week" | "month" | "year";
  dateFrom?: string;
  dateTo?: string;
  frequency: "" | "one" | "returning";
  financial: "" | "paid" | "due";
  recorder: string;
}

function dateOnly(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return eventDateString(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** Scope customer details and totals to the selected concert-date range. */
export function scopeCustomersToConcertDates(
  customers: ConcertCustomerSummary[],
  dateFrom = "",
  dateTo = "",
): ConcertCustomerSummary[] {
  if (!dateFrom && !dateTo) return customers;

  return customers.flatMap((customer) => {
    const concerts = customer.concerts.filter((concert) => {
      const date = dateOnly(concert.date);
      if (!date) return false;
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
    if (concerts.length === 0) return [];

    const concertIds = new Set(concerts.map((concert) => concert.id));
    const lastConcertAt = concerts
      .map((concert) => dateOnly(concert.date))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return [{
      ...customer,
      concerts,
      payments: customer.payments.filter((payment) => concertIds.has(payment.concertId)),
      lastConcertAt,
      concertCount: concerts.length,
      completedCount: concerts.filter((concert) => concert.status === "completed").length,
      cancelledCount: concerts.filter((concert) => concert.status === "cancelled").length,
      upcomingCount: concerts.filter((concert) => concert.status === "planned" || concert.status === "confirmed").length,
      totalValue: concerts.reduce((sum, concert) => sum + (concert.status === "cancelled" ? 0 : concert.price), 0),
      totalCollected: concerts.reduce((sum, concert) => sum + (concert.status === "cancelled" ? 0 : concert.paid), 0),
      totalRemaining: concerts.reduce((sum, concert) => sum + concert.remaining, 0),
      totalRefunded: concerts.reduce((sum, concert) => sum + concert.refundAmount, 0),
    }];
  });
}

export function filterConcertCustomers(
  customers: ConcertCustomerSummary[],
  filters: CustomerFilters,
  now = new Date(),
) {
  customers = scopeCustomersToConcertDates(customers, filters.dateFrom, filters.dateTo);
  const query = filters.search.trim().toLocaleLowerCase("ar");
  return customers.filter((customer) => {
    const searchable = [
      customer.name,
      customer.primaryPhone,
      customer.secondaryPhone,
      ...customer.concerts.flatMap((concert) => [
        String(concert.concertNumber ?? ""),
        concert.venueName ?? "",
      ]),
    ].join(" ").toLocaleLowerCase("ar");

    if (query && !searchable.includes(query)) return false;
    if (filters.frequency === "one" && customer.concertCount !== 1) return false;
    if (filters.frequency === "returning" && customer.concertCount < 2) return false;
    if (filters.financial === "paid" && customer.totalRemaining > 0) return false;
    if (filters.financial === "due" && customer.totalRemaining <= 0) return false;
    if (filters.recorder && customer.firstCreatedByName !== filters.recorder) return false;

    if (filters.period) {
      if (!customer.lastConcertAt) return false;
      const day = dateOnly(customer.lastConcertAt);
      const today = riyadhDateString(now);
      if (!day) return false;
      if (filters.period === "week" || filters.period === "next-week") {
        const [from, to] = getWeekBounds(now, filters.period === "next-week" ? 1 : 0);
        if (day < from || day > to) return false;
      }
      if (filters.period === "month" && (
        day.slice(0, 7) !== today.slice(0, 7)
      )) return false;
      if (filters.period === "year" && day.slice(0, 4) !== today.slice(0, 4)) return false;
    }
    return true;
  });
}

export function pageOf<T>(items: T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  return {
    page,
    totalPages,
    items: items.slice((page - 1) * pageSize, page * pageSize),
  };
}
