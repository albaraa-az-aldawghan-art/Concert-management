import assert from "node:assert/strict";
import test from "node:test";
import { latinFieldValue, numericFieldError, validCalendarValue } from "./latin-fields";

test("numeric fields normalize Arabic/Persian digits and only the user's decimal separator", () => {
  assert.equal(latinFieldValue("\u0661\u0662\u0664"), "124");
  assert.equal(latinFieldValue("\u06f7\u06f7\u06f9"), "779");
  assert.equal(latinFieldValue("\u0661\u0662\u066b\u0665"), "12.5");
  assert.equal(latinFieldValue("12,5"), "12.5");
  assert.equal(latinFieldValue(""), "");
  assert.equal(latinFieldValue("710"), "710");
});
test("text-rendered numeric fields preserve required boundary and decimal validation", () => {
  assert.equal(numericFieldError("", 0), "");
  assert.equal(numericFieldError("0", 0), "");
  assert.ok(numericFieldError("-1", 0));
  assert.ok(numericFieldError("11", 0, 10));
  assert.ok(numericFieldError("1.5", 0));
  assert.equal(numericFieldError("1.5", 0, 10, 0.01), "");
  assert.equal(numericFieldError("0.3", 0, 10, 0.1), "");
  assert.equal(numericFieldError("0.1234", 0, 10, "any"), "");
  assert.ok(numericFieldError("abc"));
});
test("calendar keeps ISO dates, leap days and inclusive date/month bounds", () => {
  assert.equal(validCalendarValue("2026-10-08", "date"), true);
  assert.equal(validCalendarValue("2026-10", "month"), true);
  assert.equal(validCalendarValue("2024-02-29", "date"), true);
  assert.equal(validCalendarValue("2026-02-29", "date"), false);
  assert.equal(validCalendarValue("2026-13", "month"), false);
  assert.equal(validCalendarValue("2026-10-", "date"), false);
  assert.equal(validCalendarValue("2026-10-08", "date", "2026-10-08", "2026-10-08"), true);
  assert.equal(validCalendarValue("2026-10-07", "date", "2026-10-08"), false);
  assert.equal(validCalendarValue("2026-11", "month", undefined, "2026-10"), false);
  assert.equal(validCalendarValue("2026-10-08T13:45", "datetime-local"), true);
  assert.equal(validCalendarValue("2026-10-08T24:01", "datetime-local"), false);
  assert.equal(validCalendarValue("13:45", "time"), true);
  assert.equal(validCalendarValue("25:00", "time"), false);
});
