import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { svcAddIncomingInvoice } from "./costs-core";

test("purchase invoice converts purchase units into issue-unit stock without changing invoice value", async () => {
  const records = new Map<string, Record<string, unknown>>([
    ["cost_items/CHICKEN", {
      name: "دجاج", unit: "حبة", purchaseUnit: "كرتون", purchaseToIssue: 12,
      totalIn: 0, totalOut: 0, totalInValue: 0,
    }],
  ]);
  let sequence = 0;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)! });
  const db = {
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id ?? `auto-${++sequence}`}`),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: (() => void)[] = [];
      await fn({
        get: async (r: { path: string }) => ({ exists: records.has(r.path), data: () => records.get(r.path) }),
        set: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => records.set(r.path, data)),
        update: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => records.set(r.path, { ...records.get(r.path), ...data })),
      });
      writes.forEach((write) => write());
    },
  } as unknown as Firestore;

  await svcAddIncomingInvoice(db, {
    supplierName: "المورد", invoiceNumber: "INV-1", invoiceDate: "2026-10-04", createdBy: "admin",
    lines: [{ itemBarcode: "CHICKEN", quantity: 2, priceBeforeVat: 120 }],
  });

  const item = records.get("cost_items/CHICKEN")!;
  assert.equal(item.totalIn, 24);
  assert.equal(item.totalInValue, 240);

  const incoming = [...records].find(([path]) => path.startsWith("cost_incoming/"))?.[1];
  assert.ok(incoming);
  assert.equal(incoming.purchaseUnit, "كرتون");
  assert.equal(incoming.purchaseQuantity, 2);
  assert.equal(incoming.purchaseToIssue, 12);
  assert.equal(incoming.quantity, 24);
  assert.equal(incoming.unit, "حبة");
  assert.equal(incoming.priceBeforeVat, 120);
  assert.equal(incoming.totalBeforeVat, 240);
});

test("legacy items use the same unit for purchase and issue", async () => {
  const records = new Map<string, Record<string, unknown>>([
    ["cost_items/RICE", { name: "أرز", unit: "كجم", totalIn: 3, totalOut: 0, totalInValue: 30 }],
  ]);
  let sequence = 0;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)! });
  const db = {
    collection: (name: string) => ({ doc: (id?: string) => ref(`${name}/${id ?? `auto-${++sequence}`}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: (() => void)[] = [];
      await fn({
        get: async (r: { path: string }) => ({ exists: records.has(r.path), data: () => records.get(r.path) }),
        set: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => records.set(r.path, data)),
        update: (r: { path: string }, data: Record<string, unknown>) => writes.push(() => records.set(r.path, { ...records.get(r.path), ...data })),
      });
      writes.forEach((write) => write());
    },
  } as unknown as Firestore;

  await svcAddIncomingInvoice(db, {
    supplierName: "المورد", invoiceNumber: "INV-2", invoiceDate: "2026-10-04", createdBy: "admin",
    lines: [{ itemBarcode: "RICE", quantity: 5, priceBeforeVat: 10 }],
  });

  assert.equal(records.get("cost_items/RICE")!.totalIn, 8);
  assert.equal(records.get("cost_items/RICE")!.totalInValue, 80);
});
