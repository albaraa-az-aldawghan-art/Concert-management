import test from "node:test";
import assert from "node:assert/strict";
import { sortConcertFoodByCurrentOrder } from "./concert-food-order";
import { ConcertFood, SalesSection } from "@/types";

const stamp = { seconds: 1, nanoseconds: 0, toDate: () => new Date(1000) } as never;

function section(id: string, name: string, order: number, itemOrder: string[] = []): SalesSection {
  return { id, name, order, itemOrder, channel: "concerts", createdAt: stamp, createdBy: "test" };
}

function food(id: string, categoryId: string, categoryName: string, selectedOption: string, barcode: string): ConcertFood {
  return {
    id, concertId: "concert", categoryId, categoryName, selectedOption,
    costItemBarcode: barcode, quantity: 1, notes: null,
    createdAt: stamp, createdBy: "test",
  };
}

const rows = [
  food("old-main-2", "legacy-main", "الأطباق الرئيسية", "أرز", "rice"),
  food("new-dessert", "desserts", "الحلويات والفواكه", "كيك", "cake"),
  food("new-main-1", "main", "الأطباق الرئيسية", "دجاج", "chicken"),
  food("unknown", "removed", "قسم قديم", "صنف قديم", "old"),
];

test("applies current section and item order to old and new records", () => {
  const sections = [
    section("desserts", "الحلويات والفواكه", 0, ["cake"]),
    section("main", "الأطباق الرئيسية", 1, ["chicken", "rice"]),
  ];
  assert.deepEqual(sortConcertFoodByCurrentOrder(rows, sections).map((row) => row.id), [
    "new-dessert", "new-main-1", "old-main-2", "unknown",
  ]);
});

test("reflects a newly saved order without rewriting historical records", () => {
  const reordered = [
    section("desserts", "الحلويات والفواكه", 1, ["cake"]),
    section("main", "الأطباق الرئيسية", 0, ["rice", "chicken"]),
  ];
  assert.deepEqual(sortConcertFoodByCurrentOrder(rows, reordered).map((row) => row.id), [
    "old-main-2", "new-main-1", "new-dessert", "unknown",
  ]);
});

test("uses the stable section id when its displayed name has changed", () => {
  const historical = [food("row", "main", "الاسم السابق", "دجاج", "chicken")];
  const sections = [section("main", "الاسم الجديد", 0, ["chicken"])];
  assert.equal(sortConcertFoodByCurrentOrder(historical, sections)[0]?.id, "row");
});
