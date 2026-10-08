import { toLatinDigits } from "./utils";

export interface ExportCustomerChoice { id: string; name: string; primaryPhone: string; secondaryPhone?: string | null }
function normalize(value: string) {
  return toLatinDigits(value).toLocaleLowerCase("ar").replace(/[\u064b-\u065f\u0640]/g, "").replace(/[أإآ]/g, "ا").trim();
}
/** Search the full eligible customer list, never the current page or selection. */
export function searchExportCustomers<T extends ExportCustomerChoice>(customers: T[], search: string): T[] {
  const query = normalize(search);
  if (!query) return customers;
  const phoneQuery = query.replace(/[\s()+-]/g, "");
  const numericQuery = /^\d+$/.test(phoneQuery);
  return customers.filter(customer => normalize(customer.name).includes(query)
    || (numericQuery && [customer.primaryPhone, customer.secondaryPhone || ""].some(phone => normalize(phone).replace(/[\s()+-]/g, "").includes(phoneQuery))));
}
