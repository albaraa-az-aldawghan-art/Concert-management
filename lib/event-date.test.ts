import test from "node:test";
import assert from "node:assert/strict";
import { compareEventDates, eventDateString } from "./event-date";

test("eventDateString normalizes supported event date values", () => {
  assert.equal(eventDateString("2026-09-25T18:30:00.000Z"), "2026-09-25");
  assert.equal(eventDateString({ toDate: () => new Date(2026, 8, 27) }), "2026-09-27");
  assert.equal(eventDateString(null), "");
});

test("compareEventDates sorts selected concerts from nearest date to farthest", () => {
  const rows = [
    { id: "far", date: "2026-10-20" },
    { id: "missing", date: null },
    { id: "near", date: "2026-09-26" },
    { id: "middle", date: "2026-10-02" },
  ];

  rows.sort((a, b) => compareEventDates(a.date, b.date));
  assert.deepEqual(rows.map((row) => row.id), ["near", "middle", "far", "missing"]);
});
