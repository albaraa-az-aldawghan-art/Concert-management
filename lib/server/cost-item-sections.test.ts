import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { svcCreateItem } from "./costs-core";

function fixture() {
  const records = new Map<string, Record<string, unknown>>([
    ["sales_sections/food", { name: "الأكل", channel: "concerts" }],
    ["sales_sections/drinks", { name: "المشروبات", channel: "concerts" }],
  ]);
  const ref = (path: string) => ({ path });
  let failCommit = false;
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      select: () => ({ get: async () => ({ docs: [...records]
        .filter(([path]) => path.startsWith(`${name}/`))
        .map(([path, data]) => ({ id: path.split("/").at(-1)!, data: () => data })) }) }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const pending: [string, Record<string, unknown>][] = [];
      await fn({
        get: async (r: { path: string }) => {
          assert.equal(pending.length, 0, "all reads must precede writes");
          return { exists: records.has(r.path), data: () => records.get(r.path) };
        },
        set: (r: { path: string }, data: Record<string, unknown>) => pending.push([r.path, data]),
      });
      if (failCommit) throw new Error("فشل الحفظ");
      for (const [path, data] of pending) records.set(path, data);
    },
  } as unknown as Firestore;
  const input = {
    name: "صنف جديد", unit: "حبة", mode: "generate" as const, kind: "produced" as const,
    productionDate: null, expiryDate: null, createdBy: "creator", salesSectionIds: ["food"],
  };
  return { db, records, input, fail: () => { failCommit = true; } };
}

test("new concert product persists in its selected section for later reads, not other sections", async () => {
  const f = fixture();
  const { id } = await svcCreateItem(f.db, f.input);
  assert.equal(id, "FRJ000001");
  const item = f.records.get(`cost_items/${id}`)!;
  assert.deepEqual(item.salesSections, ["food"]);
  assert.equal(item.kind, "produced");
  assert.equal(item.totalIn, 0);
  assert.equal(item.createdBy, "creator");
  // A fresh catalog read, as used by another concert, retains the same membership.
  const fresh = [...f.records].filter(([path]) => path.startsWith("cost_items/"));
  const sectionItems = (section: string) => fresh.filter(([, data]) => (data.salesSections as string[]).includes(section));
  assert.equal(sectionItems("food").length, 1);
  assert.equal(sectionItems("drinks").length, 0);
});

test("supplier barcode also saves membership atomically and deduplicates section IDs", async () => {
  const f = fixture();
  const { id } = await svcCreateItem(f.db, { ...f.input, mode: "supplier", barcode: "123", salesSectionIds: ["food", "food", "drinks"] });
  assert.equal(id, "123");
  assert.deepEqual(f.records.get("cost_items/123")!.salesSections, ["food", "drinks"]);
  await assert.rejects(() => svcCreateItem(f.db, { ...f.input, mode: "supplier", barcode: "123" }), /مسجّل مسبقاً/);
});

test("deleted/invalid section or failed transaction cannot leave an item or advance the counter", async () => {
  for (const id of ["missing", "", "bad/path"]) {
    const f = fixture();
    await assert.rejects(() => svcCreateItem(f.db, { ...f.input, salesSectionIds: [id] }));
    assert.equal(f.records.size, 2);
  }
  const f = fixture();
  f.fail();
  await assert.rejects(() => svcCreateItem(f.db, f.input), /فشل الحفظ/);
  assert.equal(f.records.has("counters/cost_items"), false);
  assert.equal([...f.records.keys()].some((p) => p.startsWith("cost_items/")), false);
});

test("ordinary cost item creation without sales sections remains supported", async () => {
  const f = fixture();
  const { id } = await svcCreateItem(f.db, { ...f.input, salesSectionIds: undefined });
  assert.equal(f.records.get(`cost_items/${id}`)!.salesSections, undefined);
  assert.equal(f.records.get("counters/cost_items")!.lastNumber, 1);
});

test("duplicate Arabic names are rejected despite harmless spelling, punctuation, or spacing differences", async () => {
  const f = fixture();
  await svcCreateItem(f.db, { ...f.input, name: "دجاج بالكريمة" });
  for (const name of ["دجاج بالكريمه", "  دجاج   بالكريمة ", "دجاج-بالكريمة"]) {
    await assert.rejects(() => svcCreateItem(f.db, { ...f.input, name }), /مسجّل مسبقاً/);
  }
  assert.equal([...f.records.keys()].filter((p) => p.startsWith("cost_items/")).length, 1);
});
