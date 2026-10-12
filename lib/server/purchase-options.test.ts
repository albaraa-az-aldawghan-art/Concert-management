import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { isPurchaseRawItem, purchaseSupplierNames } from "../purchase-options";
import { svcAddIncoming, svcAddIncomingInvoice } from "./costs-core";

test("supplier list retains historical names and removes blank and duplicate names", () => {
  assert.deepEqual(purchaseSupplierNames([" مورد  أول ", "مورد أول", null, "", "ABC", "abc"]), purchaseSupplierNames(["مورد أول", "ABC"]));
});

test("purchase selection includes raw and legacy raw items only", () => {
  assert.equal(isPurchaseRawItem({ kind: "raw" }), true);
  assert.equal(isPurchaseRawItem({}), true);
  assert.equal(isPurchaseRawItem({ kind: "sale" }), false);
  assert.equal(isPurchaseRawItem({ kind: "produced" }), false);
});

test("server rejects non-raw items in mixed invoices before any stock or invoice write", async () => {
  for (const kind of ["sale", "produced"]) {
    let writes = 0;
    const db = {
      collection: (name: string) => ({ doc: (id = "new") => ({ path: `${name}/${id}`, id }) }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (ref: { id: string }) => ({ exists: true, data: () => ({ name: ref.id, unit: "حبة", kind: ref.id === "RAW" ? "raw" : kind }) }),
        set: () => { writes++; }, update: () => { writes++; },
      }),
    } as unknown as Firestore;
    const common = { supplierName: "مورد", invoiceDate: "2026-10-12", createdBy: "admin" };
    await assert.rejects(svcAddIncomingInvoice(db, { ...common, invoiceNumber: "TEST", lines: [{ itemBarcode: "RAW", quantity: 2, priceBeforeVat: 10 }, { itemBarcode: "OTHER", quantity: 1, priceBeforeVat: 5 }] }), /المواد الخام فقط/);
    await assert.rejects(svcAddIncoming(db, { ...common, itemBarcode: "OTHER", quantity: 1, priceBeforeVat: 5 }), /المواد الخام فقط/);
    assert.equal(writes, 0);
  }
});
