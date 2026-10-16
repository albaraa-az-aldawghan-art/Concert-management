import assert from "node:assert/strict";
import test from "node:test";
import { carriedDayLines, openingStockForDate, nextContractDate } from "./contract-day-carry";

test("يرحّل رصيد آخر الشهر إلى أول يوم في الشهر التالي", () => {
  const opening = openingStockForDate([], "2026-10-01", { sandwich: 4, juice: 0 });
  assert.deepEqual([...opening], [["sandwich", 4], ["juice", 0]]);
  assert.deepEqual(carriedDayLines(["juice", "sandwich"], opening), [
    { barcode: "sandwich", supplied: "", damaged: "", remaining: "4" },
  ]);
});

test("يوم 11 يأخذ آخر جرد يوم 8 ويتجاهل اليوم الحالي والأيام المستقبلية", () => {
  const opening = openingStockForDate([
    { date: "2026-10-12", lines: [{ barcode: "A", remaining: 999 }] },
    { date: "2026-10-08", lines: [{ barcode: "A", remaining: 67 }] },
    { date: "2026-10-11", lines: [{ barcode: "A", remaining: 50 }] },
  ], "2026-10-11", { A: 10 });
  assert.equal(opening.get("A"), 67);
});

test("كل صنف من آخر يوم مسجل له ولا يمحو جرد قسم رصيد القسم الآخر", () => {
  const days = [
    { date: "2026-10-08", lines: [{ barcode: "A", remaining: 67 }, { barcode: "B", remaining: 701 }] },
    { date: "2026-10-10", lines: [{ barcode: "B", remaining: 0 }] },
  ];
  const original = JSON.stringify(days);
  assert.deepEqual([...openingStockForDate(days, "2026-10-11", { A: 10, B: 10, C: 4 })], [["A", 67], ["B", 0], ["C", 4]]);
  assert.equal(JSON.stringify(days), original);
});

test("اليوم التالي يعمل في نهاية الشهر والسنة والسنة الكبيسة", () => {
  for (const [date, next] of [["2026-10-11", "2026-10-12"], ["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"], ["2028-02-28", "2028-02-29"], ["2026-02-28", "2026-03-01"]]) {
    assert.equal(nextContractDate(date), next);
  }
  assert.equal(nextContractDate("2026-02-30"), "");
  assert.equal(nextContractDate(""), "");
});

test("آخر يوم داخل الشهر يسود على رصيد بداية الشهر", () => {
  const opening = openingStockForDate([
    { date: "2026-10-02", lines: [{ barcode: "sandwich", remaining: 3 }] },
    { date: "2026-10-04", lines: [{ barcode: "sandwich", remaining: 1 }] },
  ], "2026-10-05", { sandwich: 8 });
  assert.equal(opening.get("sandwich"), 1);
});
