import assert from "node:assert/strict";
import test from "node:test";
import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { CUSTOMER_CONCERT_PAGE_SIZE, CUSTOMER_PAGE_SIZE, filterConcertCustomers, pageOf } from "./customer-list";

const customer = (index: number): ConcertCustomerSummary => ({
  id: `customer-${index}`, name: `عميل ${index}`, primaryPhone: `050000${String(index).padStart(4, "0")}`,
  secondaryPhone: null, source: null, referralName: null, notes: null,
  firstRegisteredAt: "2026-01-01T00:00:00.000Z", firstCreatedBy: "admin", firstCreatedByName: "المدير العام",
  lastConcertAt: "2026-10-01T00:00:00.000Z", concertCount: 1, completedCount: 0, cancelledCount: 0,
  upcomingCount: 1, totalValue: 100, totalCollected: 50, totalRemaining: 50, totalRefunded: 0,
  concerts: [{ id: `concert-${index}`, concertNumber: index, date: "2026-10-01", createdAt: null,
    venueName: index === 25 ? "قاعة الهدف" : "قاعة", peopleCount: null, status: "confirmed", price: 100,
    paid: 50, remaining: 50, refundAmount: 0, invoiceNumber: null }], payments: [],
});

test("قائمة العملاء تعرض 20 عميلاً ثم تنتقل إلى الصفحة التالية", () => {
  const customers = Array.from({ length: 45 }, (_, index) => customer(index + 1));
  assert.equal(CUSTOMER_PAGE_SIZE, 20);
  assert.equal(pageOf(customers, 1, CUSTOMER_PAGE_SIZE).items.length, 20);
  assert.equal(pageOf(customers, 2, CUSTOMER_PAGE_SIZE).items[0].id, "customer-21");
  assert.equal(pageOf(customers, 3, CUSTOMER_PAGE_SIZE).items.length, 5);
});

test("حفلات العميل لها ترقيم مستقل بمقدار 10 حفلات", () => {
  const concerts = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  assert.equal(CUSTOMER_CONCERT_PAGE_SIZE, 10);
  assert.deepEqual(pageOf(concerts, 2, CUSTOMER_CONCERT_PAGE_SIZE).items.map((item) => item.id), [11,12,13,14,15,16,17,18,19,20]);
  assert.equal(pageOf(concerts, 3, CUSTOMER_CONCERT_PAGE_SIZE).items.length, 3);
});

test("البحث والفلاتر تعمل على جميع العملاء قبل تقسيم الصفحات", () => {
  const customers = Array.from({ length: 45 }, (_, index) => customer(index + 1));
  const result = filterConcertCustomers(customers, {
    search: "قاعة الهدف", period: "", frequency: "", financial: "", recorder: "",
  }, new Date("2026-10-06T00:00:00.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "customer-25");
});
