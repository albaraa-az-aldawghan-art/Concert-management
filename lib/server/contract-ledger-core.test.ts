import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { svcContractMonth, svcSaveContractDay } from "./contract-ledger-core";

function fixture() {
  const terms = ["A", "B"].map((barcode) => ({ barcode, itemName: barcode, unit: "حبة", unitPrice: 2, openingQty: 10 }));
  const days = new Map<string, Record<string, unknown>>();
  const record = (date: string, lines: { barcode: string; remaining: number }[]) => days.set(`TEST_${date}`, {
    contractId: "TEST", date, lines: lines.map((line) => ({ ...line, supplied: 0, damaged: 0, sold: 0, revenue: 0, cost: 0 })), totals: {},
  });
  record("2026-01-01", [{ barcode: "B", remaining: 701 }]);
  record("2026-10-08", [{ barcode: "A", remaining: 67 }]);
  record("2026-10-10", [{ barcode: "B", remaining: 0 }]);
  const snap = (id: string) => ({ exists: days.has(id), data: () => days.get(id) });
  const db = { collection: (collection: string) => ({
    doc: (id: string) => collection === "contracts"
      ? { get: async () => ({ exists: true, data: () => ({ name: "Test", status: "active", terms }) }) }
      : { id, get: async () => snap(id), set: async (value: Record<string, unknown>) => { days.set(id, value); } },
    where: (_field: string, _op: string, contractId: string) => ({ get: async () => ({ docs: [...days.values()].filter((day) => day.contractId === contractId).map((day) => ({ data: () => day })) }) }),
  }) } as unknown as Firestore;
  return { db, days };
}

test("الخادم يحفظ يوم 11 من آخر جرد لكل صنف ثم يرحل الباقي ليوم 12 دون بيع وهمي", async () => {
  const { db, days } = fixture();
  const save = (date: string, remaining: number) => svcSaveContractDay(db, {
    contractId: "TEST", date, lines: [{ barcode: "A", supplied: 0, damaged: 0, remaining }],
    collections: {}, expenses: [], custody: 0, notes: null, uid: "test",
  });
  await save("2026-10-11", 50);
  const first = days.get("TEST_2026-10-11") as { lines: { openingQty: number; sold: number; revenue: number }[] };
  assert.equal(first.lines[0].openingQty, 67);
  assert.equal(first.lines[0].sold, 17);
  assert.equal(first.lines[0].revenue, 34);
  await save("2026-10-12", 50);
  const second = days.get("TEST_2026-10-12") as typeof first;
  assert.equal(second.lines[0].openingQty, 50);
  assert.equal(second.lines[0].sold, 0);
  await save("2026-10-12", 45);
  assert.equal((days.get("TEST_2026-10-12") as typeof first).lines[0].openingQty, 50);
});

test("رصيد الشهر يجلب جرداً أقدم من 180 يوماً ويحافظ على الصفر الصريح", async () => {
  const { db, days } = fixture();
  days.delete("TEST_2026-10-10");
  const october = await svcContractMonth(db, "TEST", "2026-10");
  assert.equal(october.openingStock.B, 701);
  assert.equal(october.items.find((item) => item.barcode === "B")?.closing, 701);
  const november = await svcContractMonth(db, "TEST", "2026-11");
  assert.equal(november.openingStock.A, 67);
  assert.equal(november.totals.closingStock, 768);
});
