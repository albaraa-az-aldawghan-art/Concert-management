import assert from "node:assert/strict";
import test from "node:test";
import { isOverdueConcert, remainingAmount } from "./overdue-concerts";

const today = "2026-09-18";
const concert = (date: string, price = 1_000, deposit = 0, status = "confirmed") => ({
  date,
  price,
  deposit,
  status,
});

test("يعد الحفلة متأخرة فقط بعد انتهاء تاريخها ومع وجود مبلغ متبقٍ", () => {
  assert.equal(isOverdueConcert(concert("2026-09-17"), today), true);
  assert.equal(isOverdueConcert(concert("2026-09-18"), today), false);
  assert.equal(isOverdueConcert(concert("2026-09-19"), today), false);
});

test("يستثني المسددة والملغاة ولا يسمح بمتبقٍ سالب", () => {
  assert.equal(isOverdueConcert(concert("2026-09-17", 1_000, 1_000), today), false);
  assert.equal(isOverdueConcert(concert("2026-09-17", 1_000, 0, "cancelled"), today), false);
  assert.equal(remainingAmount(concert("2026-09-17", 1_000, 1_500)), 0);
});
