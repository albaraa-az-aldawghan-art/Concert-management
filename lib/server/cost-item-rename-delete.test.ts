import test from "node:test";
import assert from "node:assert/strict";
import { renameRecipeItem, recipeUsesItem } from "./costs-core";

test("renaming a product updates its copied name and unit inside other recipes", () => {
  const recipe = [
    { barcode: "FRJ000001", itemName: "الاسم القديم", unit: "حبة", qty: 2, perQty: 1 },
    { barcode: "FRJ000002", itemName: "مكوّن آخر", unit: "جم", qty: 50, perQty: 1 },
  ];

  const renamed = renameRecipeItem(recipe, "FRJ000001", "الاسم الجديد", "علبة");

  assert.deepEqual(renamed[0], {
    barcode: "FRJ000001", itemName: "الاسم الجديد", unit: "علبة", qty: 2, perQty: 1,
  });
  assert.deepEqual(renamed[1], recipe[1]);
  assert.equal(recipe[0].itemName, "الاسم القديم", "the helper must not mutate the saved input snapshot");
});

test("deletion guard detects a product used by another recipe", () => {
  const recipe = [{ barcode: "FRJ000001" }, { barcode: "FRJ000002" }];
  assert.equal(recipeUsesItem(recipe, "FRJ000001"), true);
  assert.equal(recipeUsesItem(recipe, "FRJ000099"), false);
  assert.equal(recipeUsesItem(undefined, "FRJ000001"), false);
});
