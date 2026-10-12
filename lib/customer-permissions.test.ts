import assert from "node:assert/strict";
import test from "node:test";
import { customerAccess, visibleCustomerRecords } from "./customer-permissions";
import { canAccess, canFeature, pageKeyFromPath, firstAllowedPath, normalizedFeatures, KEYS_BY_PAGE } from "./permissions";
import type { AppUser, CustomRole } from "@/types";
import type { ConcertCustomerSummary } from "./firestore/customers";

const accessFor = (keys: string[]) => customerAccess((page, key) => page === "customers" && keys.includes(key));
test("customers are independent of contracts; all employee roles can be granted customer access", () => {
  const contractsOnly = { permissions: { contracts: ["customers_edit", "customers_export", "edit"] } } as unknown as CustomRole;
  for (const role of ["custom", "employee", "supervisor", "kitchen", "warehouse_manager"] as const) {
    const user = { role } as AppUser;
    assert.equal(canAccess(user, contractsOnly, "customers"), false);
    const customerRole = { permissions: { customers: ["financial"] } } as unknown as CustomRole;
    assert.equal(canAccess(user, customerRole, "customers"), true);
    assert.equal(canAccess(user, customerRole, "contracts"), false);
    assert.equal(canFeature(user, customerRole, "customers", "edit"), false);
    assert.equal(firstAllowedPath(user, customerRole), "/admin/customers");
  }
  assert.equal(pageKeyFromPath("/admin/customers"), "customers");
  assert.deepEqual(KEYS_BY_PAGE.customers, ["edit", "export", "financial", "payments", "source", "notes", "activity"]);
  assert.deepEqual(normalizedFeatures(contractsOnly, "contracts"), ["edit"]);
  assert.deepEqual(normalizedFeatures({ permissions: { employees: ["view"] } } as unknown as CustomRole, "employees"), ["view"]);
  assert.equal(canAccess({ role: "admin" } as AppUser, null, "customers"), true);
});

const record = {
  id: "phone_TEST", name: "عميل الاختبار", primaryPhone: "0500000000", secondaryPhone: null,
  source: "مصدر سري", referralName: "شخص سري", notes: "ملاحظة سرية", firstCreatedBy: "uid-secret", firstCreatedByName: "موظف سري",
  totalValue: 1234, totalCollected: 200, totalRemaining: 1034, totalRefunded: 50,
  concerts: [{ id: "c1", price: 1234, paid: 200, remaining: 1034, refundAmount: 50, invoiceNumber: "invoice-secret" }],
  payments: [{ id: "p1", amount: 200, createdBy: "uid-secret", createdByName: "موظف سري" }],
} as ConcertCustomerSummary;

test("view-only response strips sensitive fields before transmission, without mutating originals", () => {
  const result = visibleCustomerRecords([record], accessFor([]))[0];
  assert.equal(result.name, record.name);
  assert.deepEqual([result.totalValue, result.totalCollected, result.totalRemaining, result.totalRefunded], [0, 0, 0, 0]);
  assert.deepEqual([result.concerts[0].price, result.concerts[0].paid, result.concerts[0].remaining, result.concerts[0].refundAmount], [0, 0, 0, 0]);
  assert.equal(result.concerts[0].invoiceNumber, null);
  assert.deepEqual(result.payments, []);
  for (const secret of ["مصدر سري", "شخص سري", "ملاحظة سرية", "uid-secret", "موظف سري", "invoice-secret", "1234", "1034"]) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(record.totalValue, 1234);
});

test("each detailed grant has a scoped effect; editing profile cannot expose money", () => {
  const editor = visibleCustomerRecords([record], accessFor(["edit"]))[0];
  assert.equal(editor.notes, record.notes);
  assert.equal(editor.source, record.source);
  assert.equal(editor.totalValue, 0);
  assert.deepEqual(editor.payments, []);
  const financial = visibleCustomerRecords([record], accessFor(["financial"]))[0];
  assert.equal(financial.totalValue, record.totalValue);
  assert.deepEqual(financial.payments, []);
  const payments = visibleCustomerRecords([record], accessFor(["financial", "payments"]))[0];
  assert.equal(payments.payments[0].amount, 200);
  assert.equal(payments.payments[0].createdByName, "");
  assert.equal(accessFor(["payments"]).payments, false);
  assert.equal(visibleCustomerRecords([record], accessFor(["notes"]))[0].notes, record.notes);
  assert.equal(visibleCustomerRecords([record], accessFor(["source"]))[0].referralName, record.referralName);
});

test("PDF cannot bypass hidden information; full disclosure requires all statement permissions", () => {
  const keys = ["export", "financial", "payments", "source", "activity"];
  assert.equal(accessFor(keys).exportPdf, true);
  for (const key of keys) assert.equal(accessFor(keys.filter(value => value !== key)).exportPdf, false);
  assert.equal(accessFor(["export", "financial", "payments", "edit", "activity"]).exportPdf, true);
  assert.equal(visibleCustomerRecords([record], accessFor([...keys, "notes"]))[0].payments[0].createdByName, record.payments[0].createdByName);
});
