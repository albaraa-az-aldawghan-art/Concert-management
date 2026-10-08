import assert from "node:assert/strict";
import test from "node:test";
import { searchExportCustomers } from "./customer-export-search";
const customers = Array.from({ length: 45 }, (_, index) => ({ id: `c-${index}`, name: `عميل ${index}`, primaryPhone: `050000${String(index).padStart(4, "0")}` }));
test("export search includes customers after the first page without changing selections or data", () => {
  const selectedIds = ["c-1", "c-44"];
  assert.deepEqual(searchExportCustomers(customers, "عميل 44").map(customer => customer.id), ["c-44"]);
  assert.deepEqual(selectedIds, ["c-1", "c-44"]);
  assert.equal(searchExportCustomers(customers, "").length, 45);
  assert.equal(searchExportCustomers(customers, "لا يوجد").length, 0);
});
test("export search accepts Arabic keyboard digits, spaced phones, diacritics and secondary phones", () => {
  const data = [{ id: "a", name: "أحْمَد", primaryPhone: "050 123 4567", secondaryPhone: "0551234567" }];
  assert.equal(searchExportCustomers(data, "احمد").length, 1);
  assert.equal(searchExportCustomers(data, "\u0660\u0665\u0660\u0661\u0662\u0663").length, 1);
  assert.equal(searchExportCustomers(data, "055123").length, 1);
});
