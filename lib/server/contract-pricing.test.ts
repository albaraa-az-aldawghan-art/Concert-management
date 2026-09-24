import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { Contract, ContractType } from "@/types";
import { svcCreateContract, svcUpdateContract } from "./contracts-core";
import { svcSaveContractDay, svcContractMonth, svcPostMonthCollections, svcUnpostMonthCollections, svcDeleteContractDay } from "./contract-ledger-core";
import { buildContractMonthWorkbook } from "./contract-ledger-export";
import { productContractPrice } from "../contract-pricing";

// In-memory SDK boundary: no credentials, network, or production data.
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  let sequence = 0;
  function ref(path: string) {
    return {
      path, id: path.split("/").at(-1)!,
      get: async () => ({ exists: records.has(path), data: () => records.get(path), ref: ref(path), id: path.split("/").at(-1)! }),
      set: async (data: Record<string, unknown>, options?: { merge: boolean }) => { records.set(path, { ...(options?.merge ? records.get(path) : {}), ...data }); },
      update: async (data: Record<string, unknown>) => {
        assert.ok(records.has(path));
        records.set(path, { ...records.get(path), ...data });
      },
      delete: async () => { records.delete(path); },
    };
  }
  function collection(name: string, predicates: [string, unknown][] = [], limit = Infinity) {
    return {
      doc: (id = `id-${++sequence}`) => ref(`${name}/${id}`),
      where: (key: string, op: string, value: unknown) => { assert.equal(op, "=="); return collection(name, [...predicates, [key, value]], limit); },
      limit: (n: number) => collection(name, predicates, n),
      get: async () => {
        const rows = [...records].filter(([path, data]) => path.startsWith(`${name}/`) && predicates.every(([k, v]) => data[k] === v)).slice(0, limit);
        const docs = await Promise.all(rows.map(([path]) => ref(path).get()));
        return { docs, empty: docs.length === 0 };
      },
    };
  }
  function batch() {
    const writes: (() => Promise<void>)[] = [];
    return {
      set: (r: ReturnType<typeof ref>, d: Record<string, unknown>) => writes.push(() => r.set(d)),
      update: (r: ReturnType<typeof ref>, d: Record<string, unknown>) => writes.push(() => r.update(d)),
      delete: (r: ReturnType<typeof ref>) => writes.push(() => r.delete()),
      commit: async () => { for (const write of writes) await write(); },
    };
  }
  const db = {
    collection, batch,
    getAll: (...refs: ReturnType<typeof ref>[]) => Promise.all(refs.map((r) => r.get())),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const b = batch();
      const result = await fn({ ...b, get: (r: ReturnType<typeof ref>) => r.get() });
      await b.commit();
      return result;
    },
  } as unknown as Firestore;
  records.set("sales_sections/school", { name: "المدارس", channel: "contracts" });
  records.set("sales_sections/institute", { name: "المعاهد", channel: "contracts" });
  records.set("sales_sections/restaurant", { name: "مطعم", channel: "restaurant" });
  records.set("cost_items/sandwich", {
    name: "ساندويتش", unit: "حبة", totalIn: 100, totalOut: 0, totalInValue: 300,
    salesSections: ["school", "institute"], sectionPrices: { school: 5, institute: 7 },
  });
  const draft = (type: ContractType = "collected") => ({
    contractType: type, priceSectionId: type === "paid" ? "school" : null,
    name: "مدرسة النور", clientName: null, clientPhone: null,
    startDate: "2026-09-01", endDate: "2026-12-31", vatRate: 15, totalValue: null,
    terms: [{ barcode: "sandwich", quantity: 10, unitPrice: 999 }], notes: null, createdBy: "admin",
  });
  const contract = (id: string) => records.get(`contracts/${id}`) as unknown as Contract;
  return { db, records, draft, contract };
}

test("collected uses authoritative cost; paid uses the selected section, never client price", async () => {
  const f = fixture();
  const a = await svcCreateContract(f.db, f.draft());
  const b = await svcCreateContract(f.db, f.draft("paid"));
  const c = await svcCreateContract(f.db, { ...f.draft("paid"), priceSectionId: "institute" });
  assert.deepEqual([a, b, c].map(({ id }) => f.contract(id).terms[0].unitPrice), [3, 5, 7]);
  assert.deepEqual([a, b, c].map(({ id }) => f.contract(id).totalValue), [30, 50, 70]);
  assert.deepEqual([a.contractNumber, b.contractNumber, c.contractNumber], [1, 2, 3]);
  assert.equal(f.contract(c.id).priceSectionName, "المعاهد");
  assert.equal(f.contract(a.id).paid, 0);
  assert.equal(f.records.get("cost_items/sandwich")!.totalOut, 0);
});

test("rejects missing/invalid type, missing/foreign section, missing product price, and duplicate terms without writes", async () => {
  const f = fixture();
  for (const input of [
    { ...f.draft(), contractType: undefined as unknown as ContractType },
    { ...f.draft(), contractType: "other" as ContractType },
    { ...f.draft("paid"), priceSectionId: null },
    { ...f.draft("paid"), priceSectionId: "restaurant" },
    { ...f.draft("paid"), priceSectionId: "missing" },
    { ...f.draft(), terms: [...f.draft().terms, ...f.draft().terms] },
  ]) await assert.rejects(() => svcCreateContract(f.db, input));
  f.records.get("cost_items/sandwich")!.sectionPrices = {};
  await assert.rejects(() => svcCreateContract(f.db, f.draft("paid")), /سعر صالح/);
  f.records.get("cost_items/sandwich")!.salesSections = [];
  await assert.rejects(() => svcCreateContract(f.db, f.draft("paid")), /غير مرتبط/);
  assert.equal([...f.records.keys()].some((k) => k.startsWith("contracts/")), false);
  assert.equal(f.records.has("counters/contracts"), false);
});

test("missing stock cost is rejected; explicit zero selling price and cost are valid; rounding is consistent", async () => {
  assert.throws(() => productContractPrice({ totalIn: 0, totalOut: 0, totalInValue: 0 }, "collected"), /تكلفة مخزون/);
  assert.throws(() => productContractPrice({ totalIn: 10, totalOut: 0 }, "collected"));
  assert.equal(productContractPrice({ totalIn: 10, totalOut: 0, totalInValue: 0 }, "collected"), 0);
  const f = fixture();
  f.records.get("cost_items/sandwich")!.sectionPrices = { school: 0 };
  const zero = await svcCreateContract(f.db, { ...f.draft("paid"), vatRate: 0 });
  assert.equal(f.contract(zero.id).totalValue, 0);
  assert.equal(f.contract(zero.id).vatRate, 0);
  f.records.get("cost_items/sandwich")!.totalInValue = 333.33;
  const rounded = await svcCreateContract(f.db, f.draft());
  assert.equal(f.contract(rounded.id).terms[0].unitPrice, 3.33);
  assert.equal(f.contract(rounded.id).totalValue, 33.3);
});

test("edits preserve prices and term metadata; new terms use current prices; pricing source cannot change", async () => {
  const f = fixture();
  const { id } = await svcCreateContract(f.db, f.draft("paid"));
  f.contract(id).terms[0].openingQty = 4;
  f.contract(id).terms[0].category = "غذائية";
  f.records.get("cost_items/sandwich")!.sectionPrices = { school: 50 };
  f.records.set("cost_items/juice", { ...f.records.get("cost_items/sandwich"), name: "عصير", sectionPrices: { school: 2 } });
  await svcUpdateContract(f.db, id, { totalValue: null }, [
    { barcode: "sandwich", quantity: 20, unitPrice: 123 }, { barcode: "juice", quantity: 10, unitPrice: 999 },
  ]);
  assert.equal(f.contract(id).totalValue, 120);
  assert.equal(f.contract(id).terms[0].unitPrice, 5);
  assert.equal(f.contract(id).terms[0].openingQty, 4);
  assert.equal(f.contract(id).terms[0].category, "غذائية");
  assert.equal(f.contract(id).terms[1].unitPrice, 2);
  await assert.rejects(() => svcUpdateContract(f.db, id, { contractType: "collected" }), /ثابتان/);
  await assert.rejects(() => svcUpdateContract(f.db, id, { priceSectionId: "institute" }), /ثابتان/);
  await svcUpdateContract(f.db, id, { notes: "تعديل بيانات" });
  assert.equal(f.contract(id).totalValue, 120);
});

test("legacy agreements retain manual pricing; explicit contract value still overrides sum", async () => {
  const f = fixture();
  const { id } = await svcCreateContract(f.db, { ...f.draft(), totalValue: 400 });
  assert.equal(f.contract(id).totalValue, 400);
  delete f.records.get(`contracts/${id}`)!.contractType;
  await svcUpdateContract(f.db, id, { totalValue: 250 }, [{ barcode: "sandwich", quantity: 10, unitPrice: 25 }]);
  assert.equal(f.contract(id).terms[0].unitPrice, 25);
  assert.equal(f.contract(id).totalValue, 250);
});

for (const [type, price] of [["collected", 3], ["paid", 5]] as const) {
  test(`${type}: ledger, inventory, month, Excel, posting and reversal use the saved price`, async () => {
    const f = fixture();
    const { id } = await svcCreateContract(f.db, f.draft(type));
    const input = {
      contractId: id, date: "2026-09-24", lines: [{ barcode: "sandwich", supplied: 10, damaged: 0, remaining: 2 }],
      collections: { cash: 8 * price }, expenses: [], custody: null, notes: null, uid: "admin",
    };
    await svcSaveContractDay(f.db, input);
    const month = await svcContractMonth(f.db, id, "2026-09");
    assert.equal(month.contractType, type);
    assert.equal(month.items[0].salePrice, price);
    assert.equal(month.totals.sales, 8 * price);
    assert.equal(month.totals.cost, 30);
    assert.equal(month.totals.variance, 0);
    assert.equal(f.records.get("cost_items/sandwich")!.totalOut, 10);
    assert.equal(f.records.get("cost_items/sandwich")!.totalInValue, 270);
    const { wb } = await buildContractMonthWorkbook(f.db, id, "2026-09");
    const sheet = wb.worksheets[0];
    assert.equal(sheet.getCell("C5").value, type === "collected" ? "سعر التكلفة" : "سعر البيع");
    assert.equal(sheet.getCell("C6").value, price);
    assert.equal(sheet.getCell("L6").value, 8 * price);
    assert.ok((await wb.xlsx.writeBuffer()).byteLength > 0);
    await svcPostMonthCollections(f.db, id, "2026-09", "admin");
    assert.equal(f.contract(id).paid, 8 * price);
    await assert.rejects(() => svcSaveContractDay(f.db, input), /تراجَع عن الترحيل/);
    await svcUnpostMonthCollections(f.db, id, "2026-09");
    assert.equal(f.contract(id).paid, 0);
    // Even a later change in the term cannot rewrite an existing day's snapshot.
    f.contract(id).terms[0].unitPrice = 100;
    await svcSaveContractDay(f.db, input);
    assert.equal((await svcContractMonth(f.db, id, "2026-09")).totals.sales, 8 * price);
    assert.equal(f.records.get("cost_items/sandwich")!.totalOut, 10);
    await svcDeleteContractDay(f.db, id, input.date, "admin");
    assert.equal(f.records.get("cost_items/sandwich")!.totalOut, 0);
    assert.equal(f.records.get("cost_items/sandwich")!.totalInValue, 300);
  });
}
