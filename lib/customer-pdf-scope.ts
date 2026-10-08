import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { filterConcertCustomers, type CustomerFilters } from "./customer-list";

/** Selection is applied after global filters, never after UI pagination. */
export function selectCustomerStatements(customers: ConcertCustomerSummary[], filters: CustomerFilters, ids?: string[], now = new Date()) {
  const filtered = filterConcertCustomers(customers, filters, now);
  if (!ids) return filtered;
  const selected = new Set(ids);
  return filtered.filter((customer) => selected.has(customer.id));
}
