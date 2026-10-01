import assert from "node:assert/strict";
import test from "node:test";
import { deletedRawCategories, renamedRawCategories } from "./raw-categories";

test("renaming a raw category preserves its position and rejects duplicates", () => {
  assert.deepEqual(renamedRawCategories(["خضار", "لحوم و دواجن", "ألبان"], "لحوم و دواجن", "اللحوم والدواجن"), ["خضار", "اللحوم والدواجن", "ألبان"]);
  assert.throws(() => renamedRawCategories(["خضار", "ألبان"], "خضار", "ألبان"), /موجود مسبقًا/);
});

test("deleting a raw category removes only the selected category", () => {
  assert.deepEqual(deletedRawCategories(["خضار", "لحوم و دواجن", "ألبان"], "لحوم و دواجن"), ["خضار", "ألبان"]);
  assert.throws(() => deletedRawCategories(["خضار"], "غير موجود"), /غير موجود/);
});
