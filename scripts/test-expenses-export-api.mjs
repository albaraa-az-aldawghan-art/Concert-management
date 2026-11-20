import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Module from 'node:module';
import { build } from 'esbuild';
import { NextRequest } from 'next/server.js';
import ExcelJS from 'exceljs';

const records = new Map(); let serial = 0, businessReads = 0;
const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snap(path), create: async data => records.set(path, data), update: async data => records.set(path, { ...records.get(path), ...data }) });
const snap = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) });
function collection(name, filters = [], limit = Infinity) {
  return { doc: (id = 'auto_' + ++serial) => ref(name + '/' + id),
    where: (f, op, v) => collection(name, [...filters, [f, op, v]], limit), limit: n => collection(name, filters, n),
    get: async () => {
      businessReads++;
      const docs = [...records.keys()].filter(p => p.startsWith(name + '/')).map(snap).filter(s => filters.every(([f, op, v]) => op === '>=' ? s.data()[f] >= v : s.data()[f] <= v)).slice(0, limit);
      return { docs, size: docs.length };
    } };
}
globalThis.expenseFixtureDb = { collection, getAll: async (...refs) => refs.map(r => snap(r.path)) };
const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export {POST} from '@/app/api/export/expenses/route'` }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['firebase-admin/*', 'next/*', 'exceljs'], plugins: [{ name: 'fixture', setup(b) {
  b.onLoad({ filter: /firebase-admin\.ts$/ }, () => ({ loader: 'ts', contents: `export const getAdminAuth=()=>({verifyIdToken:async token=>{if(token!=='TEST')throw Error('invalid');return{uid:'tester'}}});export const getAdminDb=()=>globalThis.expenseFixtureDb;` }));
} }] });
const filename = process.cwd() + '/scripts/.expenses-api.cjs';
const compiled = new Module(filename); compiled.paths = Module._nodeModulePaths(process.cwd()); compiled._compile(built.outputFiles[0].text, filename);
const call = (body = { filters: {} }, token = 'TEST') => compiled.exports.POST(new NextRequest('http://localhost/api/export/expenses', { method: 'POST', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
function reset(role = 'custom', permissions = { finances: ['expenses_export'] }) {
  records.clear(); businessReads = 0;
  records.set('users/tester', { role, customRoleId: 'fixture', name: 'موظف' }); records.set('custom_roles/fixture', { permissions });
  records.set('concerts/c', { name: 'حفلة أحمد', concertNumber: 5, status: 'completed' });
  for (let i = 0; i < 45; i++) records.set('concert_expenses/e' + i, { concertId: 'c', invoiceDate: i === 44 ? '2026-11-21' : '2026-11-20', type: 'نقل', amount: 0.1, vatIncluded: true, createdBy: 'other-user' });
  records.set('contract_days/d', { date: '2026-11-21', contractId: 'con', expenses: [{ key: 'workers', label: 'عمال', kind: 'from_till', amount: 500 }, { key: 'error', label: 'خصم', kind: 'deduct_collected', amount: 5 }], totals: { expenses: 505 } });
  records.set('contracts/con', { name: 'عقد المدارس', status: 'active' });
}
for (const token of ['', 'INVALID']) { reset(); assert.equal((await call(undefined, token)).status, 401); assert.equal(businessReads, 0); }
for (const perms of [{}, { finances: [] }, { concerts: ['export'] }, { finances: ['f_costs'] }]) { reset('custom', perms); assert.equal((await call()).status, 403); assert.equal(businessReads, 0); }
reset();
for (const filters of [null, { from: '2026-02-30' }, { from: '2026-11-22', to: '2026-11-21' }]) { assert.equal((await call({ filters })).status, 400); assert.equal(businessReads, 0); }
const before = JSON.stringify([...records].filter(([path]) => !path.startsWith('activity_logs/')));
let res = await call(); assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'no-store'); assert.match(res.headers.get('Content-Disposition'), /all-expenses.xlsx/);
const bytes = Buffer.from(await res.arrayBuffer()), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
assert.deepEqual(book.worksheets.map(s => s.name), ['ملخص المصاريف', 'جميع المصاريف']);
assert.equal(book.getWorksheet('جميع المصاريف').rowCount, 52); // 47 details + 4 headers + total
assert.equal(book.getWorksheet('ملخص المصاريف').getCell('C7').result, 509.5);
assert.equal(book.getWorksheet('ملخص المصاريف').getCell('D7').result, 500);
assert.equal(book.getWorksheet('ملخص المصاريف').getCell('E7').result, 5);
assert.equal(book.getWorksheet('ملخص المصاريف').getCell('F7').result, 4.5);
assert.equal(JSON.stringify([...records].filter(([path]) => !path.startsWith('activity_logs/'))), before);
await fs.mkdir('tmp/expenses-export', { recursive: true }); await fs.writeFile('tmp/expenses-export/fixture.xlsx', bytes);
res = await call({ filters: { from: '2026-11-21', to: '2026-11-21' } }); assert.equal(res.status, 200);
const filtered = new ExcelJS.Workbook(); await filtered.xlsx.load(Buffer.from(await res.arrayBuffer()));
assert.equal(filtered.getWorksheet('جميع المصاريف').rowCount, 8); assert.equal(filtered.getWorksheet('ملخص المصاريف').getCell('C7').result, 505.1);
records.get('contract_days/d').totals.expenses = 504;
res = await call(); assert.equal(res.status, 400); assert.match((await res.json()).error, /لا يطابق/);
reset('admin', {}); assert.equal((await call()).status, 200);
console.log('Expense export API: authentication, dedicated permission, all 45 invoices across pages, inclusive dates, exact totals, cash/deduction separation, immutable business data and real XLSX round-trip passed.');
