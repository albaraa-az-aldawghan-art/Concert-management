import assert from "node:assert/strict";
import test from "node:test";
import { productMainSection, productMainSectionLabel, productSubSectionLabel } from "./product-sections";

const sections = [
  { id: "concert-desserts", name: "الحلويات والفواكه", channel: "concerts" as const },
  { id: "restaurant-main", name: "الأطباق الرئيسية", channel: "restaurant" as const },
  { id: "contract-school", name: "المدارس", channel: "contracts" as const },
];

test("FRJ000715-style product derives concerts and its subsection from the linked section", () => {
  const item = { kind: "sale", salesSections: ["concert-desserts"] };
  assert.equal(productMainSection(item, sections), "concerts");
  assert.equal(productMainSectionLabel(item, sections), "الحفلات");
  assert.equal(productSubSectionLabel(item, sections), "الحلويات والفواكه");
});

test("restaurant, contracts and manufactured products match the application table", () => {
  assert.equal(productMainSectionLabel({ kind: "sale", salesSections: ["restaurant-main"] }, sections), "المطعم");
  assert.equal(productMainSectionLabel({ kind: "sale", salesSections: ["contract-school"] }, sections), "التعاقدات");
  assert.equal(productMainSectionLabel({ kind: "produced", salesSections: ["concert-desserts"] }, sections), "منتجات مصنعة");
});

test("saved main channel has application priority and subsection uses the first selection", () => {
  const item = { kind: "sale", salesChannel: "contracts", salesSections: ["concert-desserts", "restaurant-main"] };
  assert.equal(productMainSectionLabel(item, sections), "التعاقدات");
  assert.equal(productSubSectionLabel(item, sections), "الحلويات والفواكه");
  assert.equal(productMainSectionLabel({ kind: "sale" }, sections), "بلا قسم");
});
