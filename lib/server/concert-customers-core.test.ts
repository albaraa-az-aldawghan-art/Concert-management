import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { listConcertCustomers } from "./concert-customers-core";
import { selectCustomerStatements } from "../customer-pdf-scope";

test("كشف الحساب يقرأ الدفعات الأصلية ويربطها بالحفلة والعميل الصحيحين", async () => {
  const data: Record<string, Record<string, unknown>[]> = {
    concerts: [
      { id: "a", clientName: "أحمد", clientPhone: "0500000001", concertNumber: 1, date: Timestamp.fromDate(new Date("2026-10-08")), createdAt: Timestamp.fromDate(new Date("2026-09-01")), price: 1200.50, deposit: 999999, status: "confirmed" },
      { id: "b", clientName: "أحمد", clientPhone: "0500000001", concertNumber: 2, date: Timestamp.fromDate(new Date("2026-10-09")), price: 300, status: "cancelled", refundAmount: 100 },
      { id: "c", clientName: "خالد", clientPhone: "0500000002", concertNumber: 3, date: Timestamp.fromDate(new Date("2026-10-10")), price: 500, status: "confirmed" },
    ],
    concert_payments: [
      { id: "p1", concertId: "a", amount: 200.25, method: "card", cardType: "mada", date: "2026-09-20", createdBy: "u" },
      { id: "p2", concertId: "a", amount: 300.25, method: "bank_transfer", bankName: "البنك", senderName: "أحمد", receiverName: "المحاسب", date: "2026-10-02", createdBy: "u" },
      { id: "p3", concertId: "b", amount: 100, method: "cash", date: "2026-10-01" },
      { id: "p4", concertId: "c", amount: 500, method: "cash", date: "2026-10-01" },
    ],
    concert_customers: [], users: [{ id: "u", name: "الموظف" }],
  };
  const db = { collection: (name: string) => ({ get: async () => ({ docs: data[name].map((value) => ({ id: value.id, data: () => value })) }) }) } as unknown as Firestore;
  const customers = await listConcertCustomers(db);
  const ahmad = customers.find((c) => c.name === "أحمد")!;
  assert.equal(ahmad.totalValue, 1200.50);
  assert.equal(ahmad.totalCollected, 500.50);
  assert.equal(ahmad.totalRemaining, 700);
  assert.equal(ahmad.totalRefunded, 100);
  assert.equal(ahmad.payments.length, 3);
  assert.equal(ahmad.payments.find((p) => p.id === "p1")?.cardType, "mada");
  assert.equal(ahmad.payments.find((p) => p.id === "p2")?.bankName, "البنك");
  assert.equal(ahmad.payments.find((p) => p.id === "p2")?.createdByName, "الموظف");
  assert.ok(!ahmad.payments.some((p) => p.id === "p4"));
  const [scoped] = selectCustomerStatements(customers, { search: "أحمد", dateFrom: "2026-10-08", dateTo: "2026-10-08", period: "", frequency: "", financial: "", recorder: "" });
  assert.equal(scoped.payments.length, 2);
  assert.equal(scoped.totalCollected, 500.50);
  assert.equal(scoped.totalRemaining, 700);
});
