import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server.js";
import { build } from "esbuild";

const records = [
  { id: "p0", concertId: "a", date: "2026-11-17", amount: 400 },
  { id: "p1", concertId: "a", date: "2026-11-18", amount: 0.1, method: "bank_transfer", bankName: "بنك تجريبي", senderName: "مرسل ١", receiverName: "قديم" },
  { id: "p2", concertId: "a", date: "2026-11-18", amount: 0.2, method: "card", cardType: "mada" },
  { id: "p3", concertId: "b", date: "2026-11-21", amount: 1200.45, method: "cash", receiverName: "مستلم تجريبي" },
  { id: "p4", concertId: "a", date: "2026-11-22", amount: 800, method: "card", cardType: "visa" },
  { id: "legacy", concertId: "archived", date: "", amount: 1.005, method: "old-unknown", bankName: "خاص" },
];
let permissions = {};
let reads = 0;
let selectedFields = [];

function query(filters = [], max = records.length, fields = []) {
  return {
    where: (field, operator, value) => query([...filters, { field, operator, value }], max, fields),
    select(...fields) {
      selectedFields = fields;
      return query(filters, max, fields);
    },
    limit: n => query(filters, n, fields),
    async get() {
      reads++;
      const rows = records.filter(row => filters.every(({ field, operator, value }) => {
        assert.equal(field, "date");
        return operator === ">=" ? row.date >= value : row.date <= value;
      })).slice(0, max);
      return { size: rows.length, docs: rows.map(row => ({
        id: row.id,
        data: () => Object.fromEntries(fields.map(field => [field, row[field]])),
      })) };
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
assert.deepEqual(selectedFields, ["date", "amount", "concertId", "method", "cardType"]);
const noDetails = { bankName: null, senderName: null, receiverName: null };
assert.deepEqual(await response.json(), {
  count: 3, totalHalalas: 120075, payments: [
    { id: "p3", concertId: "b", date: "2026-11-21", amountHalalas: 120045, method: "cash", cardType: null, ...noDetails },
    { id: "p1", concertId: "a", date: "2026-11-18", amountHalalas: 10, method: "bank_transfer", cardType: null, ...noDetails },
    { id: "p2", concertId: "a", date: "2026-11-18", amountHalalas: 20, method: "card", cardType: "mada", ...noDetails },
  ],
});
const all = await (await get()).json();
assert.deepEqual(all.payments.at(-1), { id: "legacy", concertId: "archived", date: null, amountHalalas: 101, method: null, cardType: null, ...noDetails });
assert.equal(all.payments[0].cardType, "visa");
assert.equal(all.totalHalalas, 240176);
assert.equal((await (await get({ from: "2026-11-18", to: "2026-11-18" })).json()).totalHalalas, 30);
assert.equal((await (await get({ from: "2026-11-21" })).json()).totalHalalas, 200045);
assert.deepEqual(await (await get({ from: "2026-01-01", to: "2026-01-01" })).json(), { count: 0, totalHalalas: 0, payments: [] });

permissions.concerts = ["pay_view", "pf_bank"];
const detailed = await (await get({ from: "2026-11-18", to: "2026-11-21" })).json();
assert.deepEqual(selectedFields.slice(-3), ["bankName", "senderName", "receiverName"]);
assert.equal(detailed.totalHalalas, 120075);
assert.equal(detailed.payments[0].receiverName, "مستلم تجريبي");
assert.equal(detailed.payments[1].bankName, "بنك تجريبي");
assert.equal(detailed.payments[1].senderName, "مرسل 1");
assert.equal(detailed.payments[1].receiverName, null);

permissions = { finances: ["f_collected", "table_view"], concerts: ["pay_view", "pf_bank"] };
assert.deepEqual(await (await get({ from: "2026-11-18", to: "2026-11-21" })).json(), { count: 3, totalHalalas: 120075, payments: null });
assert.deepEqual(selectedFields, ["date", "amount"]);
console.log("Payment date report: inclusive dates, exact halala totals, methods and card types, legacy records, and access-controlled payment details passed.");
