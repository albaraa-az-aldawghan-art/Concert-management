import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialRequestPdf } from "./material-request-pdf";
import type { MaterialRequest } from "./material-requests";

const request: MaterialRequest = { id: "req", number: "MR-test", source: "manual", state: "partial", createdBy: "user", requestDate: "2026-11-20", createdAt: "", updatedAt: "", lastReceivedAt: null, notes: '<script>alert("x")</script>', lines: [{ barcode: "RICE", name: "أرز & حبوب", unit: "كجم", purchaseUnit: "كيس", purchaseToIssue: 10, enteredUnit: "purchase", enteredQuantity: 2, requested: 20, received: 5, posted: 0, cancelled: 3, balanceAtRequest: 0, minimumAtRequest: 0 }] };
test("material request PDF prints exact stock quantities, remaining after cancellation, and escapes all external text", () => {
  const html = buildMaterialRequestPdf(request, request.lines, "المطعم", "أحمد <محمد>", "");
  assert.ok(html.includes('class="num">12</td>'));
  assert.ok(html.includes('class="num">20</td>'));
  assert.ok(html.includes("أرز &amp; حبوب"));
  assert.ok(html.includes("أحمد &lt;محمد&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!/[٠-٩۰-۹]/.test(html));
  assert.throws(() => buildMaterialRequestPdf(request, [], "الحفلات", "", ""), /لا توجد مواد/);
});
