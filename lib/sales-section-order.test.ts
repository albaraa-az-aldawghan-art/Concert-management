import test from "node:test";
import assert from "node:assert/strict";
import { orderSalesSections, validateSalesSectionOrder } from "./sales-section-order";

test("ترتيب الأقسام المحفوظ ينتقل إلى كل مستهلك للقائمة", () => {
  const result = orderSalesSections([
    { id: "حلويات", order: 2 },
    { id: "مقبلات", order: 0 },
    { id: "رئيسية", order: 1 },
  ]);
  assert.deepEqual(result.map((section) => section.id), ["مقبلات", "رئيسية", "حلويات"]);
});

test("لا يسمح ترتيب قناة التعاقدات بإسقاط قسم أو إدخال قسم من قناة أخرى", () => {
  const existing = [
    { id: "c1", channel: "contracts" as const },
    { id: "c2", channel: "contracts" as const },
    { id: "r1", channel: "restaurant" as const },
  ];
  assert.deepEqual(validateSalesSectionOrder("contracts", ["c2", "c1"], existing), ["c2", "c1"]);
  assert.throws(() => validateSalesSectionOrder("contracts", ["c1"], existing));
  assert.throws(() => validateSalesSectionOrder("contracts", ["c1", "r1"], existing));
  assert.throws(() => validateSalesSectionOrder("contracts", ["c1", "c1"], existing));
});
