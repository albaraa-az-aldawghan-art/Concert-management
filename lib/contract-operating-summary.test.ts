import assert from "node:assert/strict";
import test from "node:test";
import { summarizeContractDays } from "./contract-operating-summary";

test("contract operating summary keeps sales, collections, costs and expenses distinct", () => {
  const summaries = summarizeContractDays([
    { contractId: "a", date: "2026-10-01", totals: { sales: 1000, collected: 800, cost: 400, expenses: 50 }, postedPaymentIds: ["p1"] },
    { contractId: "a", date: "2026-10-02", totals: { sales: 600, collected: 500, cost: 250, expenses: 25 }, postedPaymentIds: null },
    { contractId: "b", date: "2026-10-01", totals: { sales: 200, collected: 200, cost: 100, expenses: 0 }, postedPaymentIds: [] },
    { contractId: "", date: "2026-10-03", totals: { sales: 999 } },
  ]);

  assert.deepEqual(summaries.a, {
    contractId: "a", days: 2, sales: 1600, collected: 1300, postedCollected: 800,
    cost: 650, expenses: 75, lastActivityDate: "2026-10-02",
  });
  assert.equal(summaries.b.sales, 200);
  assert.equal(Object.keys(summaries).length, 2);
});
