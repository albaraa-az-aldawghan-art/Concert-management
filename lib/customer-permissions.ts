import type { PermissionPage } from "@/types";
import type { ConcertCustomerSummary } from "@/lib/firestore/customers";

export function customerAccess(feat: (page: PermissionPage, key: string) => boolean) {
  const edit = feat("customers", "edit");
  const financial = feat("customers", "financial");
  const payments = financial && feat("customers", "payments");
  const source = edit || feat("customers", "source");
  const notes = edit || feat("customers", "notes");
  const activity = feat("customers", "activity");
  const exportPdf = feat("customers", "export") && financial && payments && source && activity;
  return { edit, financial, payments, source, notes, activity, exportPdf };
}
export type CustomerAccess = ReturnType<typeof customerAccess>;

/** Remove restricted fields before the response leaves the server. */
export function visibleCustomerRecords(records: ConcertCustomerSummary[], access: CustomerAccess): ConcertCustomerSummary[] {
  return records.map(customer => ({
    ...customer,
    source: access.source ? customer.source : null,
    referralName: access.source ? customer.referralName : null,
    notes: access.notes ? customer.notes : null,
    firstCreatedBy: access.activity ? customer.firstCreatedBy : "",
    firstCreatedByName: access.activity ? customer.firstCreatedByName : "",
    totalValue: access.financial ? customer.totalValue : 0,
    totalCollected: access.financial ? customer.totalCollected : 0,
    totalRemaining: access.financial ? customer.totalRemaining : 0,
    totalRefunded: access.financial ? customer.totalRefunded : 0,
    concerts: customer.concerts.map(concert => ({
      ...concert,
      price: access.financial ? concert.price : 0,
      paid: access.financial ? concert.paid : 0,
      remaining: access.financial ? concert.remaining : 0,
      refundAmount: access.financial ? concert.refundAmount : 0,
      invoiceNumber: access.financial ? concert.invoiceNumber : null,
    })),
    payments: access.payments ? customer.payments.map(payment => ({
      ...payment,
      createdBy: access.activity ? payment.createdBy : "",
      createdByName: access.activity ? payment.createdByName : "",
    })) : [],
  }));
}
