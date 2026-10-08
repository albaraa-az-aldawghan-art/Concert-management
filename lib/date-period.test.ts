import assert from "node:assert/strict";
import test from "node:test";
import { DATE_PERIOD_OPTIONS, getWeekBounds, matchesDate, periodBounds } from "./date-period";
import { eventDateString } from "./event-date";
import { filterConcertCustomers } from "./customer-list";
import { selectCustomerStatements } from "./customer-pdf-scope";
import { buildCustomersPdfHtml } from "./customer-pdf";
import type { ConcertCustomerSummary } from "./firestore/customers";

const now = new Date("2026-10-08T12:00:00+03:00");
test("Sunday through Saturday bounds are identical on every day of the week", () => {
  for (let day = 4; day <= 10; day++) {
    const instant = new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00+03:00`);
    assert.deepEqual(getWeekBounds(instant), ["2026-10-04", "2026-10-10"]);
    assert.deepEqual(getWeekBounds(instant, 1), ["2026-10-11", "2026-10-17"]);
  }
});
test("next week is the next complete calendar week, including month/year/leap boundaries", () => {
  assert.deepEqual(periodBounds("next-week", now), ["2026-10-11", "2026-10-17"]);
  assert.deepEqual(getWeekBounds(new Date("2026-12-31T12:00:00Z")), ["2026-12-27", "2027-01-02"]);
  assert.deepEqual(getWeekBounds(new Date("2026-12-31T12:00:00Z"), 1), ["2027-01-03", "2027-01-09"]);
  assert.deepEqual(getWeekBounds(new Date("2024-02-29T12:00:00Z")), ["2024-02-25", "2024-03-02"]);
});
test("inclusive filters include Sunday/Saturday and exclude either neighboring day", () => {
  const filter = { mode: "next-week" as const, from: "2000-01-01", to: "2000-01-02" };
  for (const day of ["2026-10-11", "2026-10-17"]) assert.equal(matchesDate(day, filter, now), true);
  for (const day of ["2026-10-10", "2026-10-18"]) assert.equal(matchesDate(day, filter, now), false);
  assert.equal(matchesDate(null, filter, now), false);
  assert.equal(matchesDate(null, { ...filter, mode: "all" }, now), true);
  assert.equal(matchesDate("2026-10-08", { mode: "custom", from: "2026-10-08", to: "2026-10-08" }, now), true);
});
test("Riyadh midnight rolls the week over even while UTC is still Saturday", () => {
  const saturday = new Date("2026-10-10T20:59:59Z");
  const sunday = new Date("2026-10-10T21:00:00Z");
  assert.deepEqual(getWeekBounds(saturday), ["2026-10-04", "2026-10-10"]);
  assert.deepEqual(getWeekBounds(sunday), ["2026-10-11", "2026-10-17"]);
  assert.equal(eventDateString({ seconds: sunday.getTime() / 1000 }), "2026-10-11");
  assert.equal(eventDateString(sunday.toISOString()), "2026-10-11");
  assert.equal(matchesDate({ toDate: () => sunday }, { mode: "next-week", from: "", to: "" }, now), true);
});
test("all shared date controls expose next week", () => {
  assert.equal(DATE_PERIOD_OPTIONS.find(option => option.key === "next-week")?.label, "الأسبوع القادم");
});
test("customer UI and PDF use the same week and preserve account amounts", () => {
  function customer(id: string, date: string): ConcertCustomerSummary {
    return { id, name: id, primaryPhone: "0500000001", secondaryPhone: null, source: null, referralName: null, notes: null,
      firstRegisteredAt: date, firstCreatedBy: "admin", firstCreatedByName: "المدير", lastConcertAt: date,
      concertCount: 1, completedCount: 0, cancelledCount: 0, upcomingCount: 1, totalValue: 100, totalCollected: 25, totalRemaining: 75, totalRefunded: 0,
      concerts: [{ id, concertNumber: 1, date, createdAt: date, venueName: "قاعة", peopleCount: "10", status: "confirmed", price: 100, paid: 25, remaining: 75, refundAmount: 0, invoiceNumber: null }], payments: [] };
  }
  const records = [customer("before", "2026-10-10"), customer("sunday", "2026-10-11"), customer("saturday", "2026-10-17"), customer("after", "2026-10-18")];
  const filters = { search: "", period: "next-week" as const, frequency: "" as const, financial: "" as const, recorder: "" };
  const ui = filterConcertCustomers(records, filters, now);
  const pdf = selectCustomerStatements(records, filters, undefined, now);
  assert.deepEqual(ui.map(customer => customer.id), ["sunday", "saturday"]);
  assert.deepEqual(pdf, ui);
  assert.equal(pdf.reduce((sum, customer) => sum + customer.totalRemaining, 0), 150);
  assert.match(buildCustomersPdfHtml(pdf, now, { filters }), /الأسبوع القادم/);
});
