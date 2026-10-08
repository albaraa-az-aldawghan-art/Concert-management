import assert from "node:assert/strict";
import test from "node:test";
import { carriedDayLines, openingStockForDate } from "./contract-day-carry";

test("يرحّل رصيد آخر الشهر إلى أول يوم في الشهر التالي", () => {
  const opening = openingStockForDate([], "2026-10-01", { sandwich: 4, juice: 0 });
  assert.deepEqual([...opening], [["sandwich", 4], ["juice", 0]]);
  assert.deepEqual(carriedDayLines(["juice", "sandwich"], opening), [
    { barcode: "sandwich", supplied: "", damaged: "", remaining: "4" },
  ]);
});

test("آخر يوم داخل الشهر يسود على رصيد بداية الشهر", () => {
  const opening = openingStockForDate([
    { date: "2026-10-02", lines: [{ barcode: "sandwich", remaining: 3 }] },
    { date: "2026-10-04", lines: [{ barcode: "sandwich", remaining: 1 }] },
  ], "2026-10-05", { sandwich: 8 });
  assert.equal(opening.get("sandwich"), 1);
});
