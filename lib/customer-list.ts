import type { ConcertCustomerSummary } from "@/lib/firestore/customers";

export const CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_CONCERT_PAGE_SIZE = 10;

export interface CustomerFilters {
  search: string;
  period: "" | "month" | "year";
  frequency: "" | "one" | "returning";
  financial: "" | "paid" | "due";
  recorder: string;
}

export function filterConcertCustomers(
  customers: ConcertCustomerSummary[],
  filters: CustomerFilters,
  now = new Date(),
) {
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
      const date = new Date(customer.lastConcertAt);
      if (Number.isNaN(date.getTime())) return false;
      if (filters.period === "month" && (
        date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()
      )) return false;
      if (filters.period === "year" && date.getFullYear() !== now.getFullYear()) return false;
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
