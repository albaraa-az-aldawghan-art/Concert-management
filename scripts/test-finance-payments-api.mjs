import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server.js";
import { build } from "esbuild";

const records = [
  { id: "p0", concertId: "a", date: "2026-11-17", amount: 400 },
  { id: "p1", concertId: "a", date: "2026-11-18", amount: 0.1, senderName: "خاص" },
  { id: "p2", concertId: "a", date: "2026-11-18", amount: 0.2 },
  { id: "p3", concertId: "b", date: "2026-11-21", amount: 1200.45 },
  { id: "p4", concertId: "a", date: "2026-11-22", amount: 800 },
  { id: "legacy", concertId: "archived", date: "", amount: 1.005 },
];
let permissions = {};
let reads = 0;

function query(filters = [], max = records.length) {
  return {
    where: (field, operator, value) => query([...filters, { field, operator, value }], max),
    select(...fields) {
      assert.deepEqual(fields, ["concertId", "date", "amount"]);
      return this;
    },
    limit: n => query(filters, n),
    async get() {
      reads++;
      const rows = records.filter(row => filters.every(({ field, operator, value }) => {
        assert.equal(field, "date");
        return operator === ">=" ? row.date >= value : row.date <= value;
      })).slice(0, max);
      return { size: rows.length, docs: rows.map(row => ({ id: row.id, data: () => row })) };
    },
  };
}

globalThis.financePaymentsTestDb = {
  collection(name) {
    if (name === "concert_payments") return query();
    assert.ok(["users", "custom_roles"].includes(name));
    return { doc: () => ({ get: async () => ({ exists: true, data: () => name === "users"
      ? { role: "custom", customRoleId: "test" } : { permissions } }) }) };
  },
};

const compiledCode = await build({
  stdin: { resolveDir: process.cwd(), loader: "ts", contents: 'export { GET } from "@/app/api/finances/payments/route";' },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["firebase-admin/*", "firebase/firestore", "next/*"],
  plugins: [{ name: "firestore-fixture", setup(esbuild) {
    esbuild.onLoad({ filter: /firebase-admin\.ts$/ }, () => ({ loader: "ts", contents: `
      export const getAdminAuth = () => ({ verifyIdToken: async token => {
        if (token !== "TEST") throw new Error("invalid");
        return { uid: "tester" };
      } });
      export const getAdminDb = () => globalThis.financePaymentsTestDb;
    ` }));
  } }],
});
const filename = process.cwd() + "/scripts/.finance-payments-api.cjs";
const compiled = new Module(filename);
compiled.paths = Module._nodeModulePaths(process.cwd());
compiled._compile(compiledCode.outputFiles[0].text, filename);

function get(params = {}, token = "TEST") {
  const url = `http://localhost/api/finances/payments?${new URLSearchParams(params)}`;
  return compiled.exports.GET(new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }));
}

assert.equal((await get({}, "")).status, 401);
for (permissions of [{}, { finances: [] }, { finances: ["f_paid"] }, { finances: ["table_view"] }]) {
  assert.equal((await get()).status, 403);
}
assert.equal(reads, 0);
permissions = { finances: ["f_collected", "table_view", "f_paid"] };
for (const params of [{ from: "2026-02-30" }, { from: "2026-12-01", to: "2026-10-01" }]) {
  assert.equal((await get(params)).status, 400);
}
assert.equal(reads, 0);

const response = await get({ from: "2026-11-18", to: "2026-11-21" });
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.deepEqual(await response.json(), {
  count: 3, totalHalalas: 120075, payments: [
    { id: "p3", concertId: "b", date: "2026-11-21", amountHalalas: 120045 },
    { id: "p1", concertId: "a", date: "2026-11-18", amountHalalas: 10 },
    { id: "p2", concertId: "a", date: "2026-11-18", amountHalalas: 20 },
  ],
});
const all = await (await get()).json();
assert.deepEqual(all.payments.at(-1), { id: "legacy", concertId: "archived", date: null, amountHalalas: 101 });
assert.equal(all.totalHalalas, 240176);
assert.equal((await (await get({ from: "2026-11-18", to: "2026-11-18" })).json()).totalHalalas, 30);
assert.equal((await (await get({ from: "2026-11-21" })).json()).totalHalalas, 200045);
assert.deepEqual(await (await get({ from: "2026-01-01", to: "2026-01-01" })).json(), { count: 0, totalHalalas: 0, payments: [] });

permissions = { finances: ["f_collected", "table_view"] };
assert.deepEqual(await (await get({ from: "2026-11-18", to: "2026-11-21" })).json(), { count: 3, totalHalalas: 120075, payments: null });
console.log("Payment date report: inclusive dates, multiple payments per concert, exact halala totals, no-results, legacy dates, and permissions passed.");
