import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildBalanceWorkbook,
  buildCostsWorkbook,
  buildRestaurantTemplateWorkbook,
  buildSalesWorkbook,
  buildWarehouseWorkbook,
} from "@/lib/server/export-core";

type RecordMap = Record<string, Record<string, unknown>>;

function comparable(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return Date.parse(value);
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return value;
}

function fakeDb(collections: Record<string, RecordMap>) {
  function collection(name: string, predicates: [string, string, unknown][] = []) {
    return {
      doc(id: string) { return { id, collectionName: name }; },
      where(field: string, operator: string, value: unknown) {
        return collection(name, [...predicates, [field, operator, value]]);
      },
      async get() {
        const records = Object.entries(collections[name] ?? {}).filter(([, value]) =>
          predicates.every(([field, operator, expected]) => {
            const actual = comparable(value[field]);
            const target = comparable(expected);
            if (operator === "==") return actual === target;
            if (operator === ">=") return (actual as number) >= (target as number);
            if (operator === "<") return (actual as number) < (target as number);
            if (operator === "in") return Array.isArray(expected) && expected.includes(value[field]);
            throw new Error(`عامل غير مدعوم في الاختبار: ${operator}`);
          }));
        return {
          docs: records.map(([id, value]) => ({ id, data: () => value })),
          size: records.length,
        };
      },
    };
  }
  return { collection, getAll: async (...refs: { id: string; collectionName: string }[]) => refs.map(ref => ({
    id: ref.id, exists: !!collections[ref.collectionName]?.[ref.id], data: () => collections[ref.collectionName]?.[ref.id],
  })) } as unknown as Firestore;
}

async function roundTrip(workbook: ExcelJS.Workbook) {
  const bytes = await workbook.xlsx.writeBuffer();
  assert.ok(bytes.byteLength > 1_000);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes as ExcelJS.Buffer);
  assert.ok(reopened.worksheets.length > 0);
  return reopened;
}

function allValues(workbook: ExcelJS.Workbook) {
  const values: unknown[] = [];
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value))));
  return values;
}

test("sales export excludes cancelled balances from detail, monthly and annual totals", async () => {
  const cases = [
    { id: "cancel-unpaid", status: "cancelled", month: "10", price: 1000, payments: [] as number[], due: 0 },
    { id: "cancel-partial", status: "cancelled", month: "10", price: 1000, payments: [100, 150], due: 0 },
    { id: "cancel-full", status: "cancelled", month: "10", price: 1000, payments: [1000], due: 0 },
    { id: "cancel-overpaid", status: "cancelled", month: "11", price: 1000, payments: [1100], due: 0 },
    { id: "active-partial", status: "confirmed", month: "10", price: 1000, payments: [200, 150], due: 650 },
    { id: "active-unpaid", status: "completed", month: "11", price: 500, payments: [], due: 500 },
    { id: "cancel-only", status: "cancelled", month: "12", price: 900, payments: [50], due: 0 },
  ];
  const fixture = fakeDb({
    concerts: Object.fromEntries(cases.map(c => [c.id, { ...c, name: c.id, date: `2026-${c.month}-05`, refundAmount: 25 }])),
    concert_payments: Object.fromEntries(cases.flatMap(c => c.payments.map((amount, i) => [`${c.id}-${i}`, { concertId: c.id, amount, date: "2026-10-01", method: "cash" }]))),
  });
  // The rule must work even if the user does not select the status column.
  for (const selection of ["name,status,price,paid,due,refund", "name,price,paid,due,refund"]) {
    const original = await buildSalesWorkbook(fixture, 2026, selection);
    if (process.env.SALES_QA_PATH && selection.includes("status")) await original.xlsx.writeFile(process.env.SALES_QA_PATH);
    const workbook = await roundTrip(original);
    for (const [month, sheetName] of [["10", "أكتوبر"], ["11", "نوفمبر"], ["12", "ديسمبر"]]) {
      const sheet = workbook.getWorksheet(sheetName)!;
      const headers = sheet.getRow(3).values as unknown[];
      const dueCol = headers.indexOf("المتبقي");
      const paidCol = headers.indexOf("المحصَّل");
      const priceCol = headers.indexOf("السعر شامل الضريبة");
      const refundCol = headers.indexOf("المسترد");
      const monthlyCases = cases.filter(c => c.month === month);
      for (const c of monthlyCases) {
        const row = sheet.getRows(4, monthlyCases.length)!.find(r => r.getCell(1).value === c.id)!;
        assert.equal(row.getCell(dueCol).value, c.due, c.id);
        assert.equal(row.getCell(paidCol).value, c.payments.reduce((a, b) => a + b, 0));
        assert.equal(row.getCell(priceCol).value, c.price);
        assert.equal(row.getCell(refundCol).value, 25);
        if (c.status === "cancelled") assert.equal(row.getCell(dueCol).font.color?.argb, "FFB91C1C");
      }
      assert.equal(sheet.getRow(4 + monthlyCases.length).getCell(dueCol).value, monthlyCases.reduce((sum, c) => sum + c.due, 0));
    }
    const summary = workbook.getWorksheet("ملخص 2026")!;
    assert.equal(summary.getCell("H13").value, 650);
    assert.equal(summary.getCell("H14").value, 500);
    assert.equal(summary.getCell("H15").value, 0);
    assert.equal(summary.getCell("H16").value, 1150);
    assert.equal(summary.getCell("G16").value, cases.reduce((sum, c) => sum + c.payments.reduce((a, b) => a + b, 0), 0));
  }
});

test("filtered sales export keeps exactly the selected records across years and rechecks date basis", async () => {
  const fixture = fakeDb({ concerts: {
    a: { name: "حفلة نهاية السنة", date: "2026-12-31", createdAt: "2026-10-13", price: 1000, status: "confirmed" },
    b: { name: "حفلة بداية السنة", date: "2027-01-01", createdAt: "2026-10-13", price: 2000, status: "confirmed" },
    excluded: { name: "خارج الفلتر", date: "2026-12-31", price: 99999, status: "confirmed" },
    cancelled: { name: "ملغاة", date: "2026-12-31", price: 500, status: "cancelled" },
  }, concert_payments: { p: { concertId: "b", amount: 500, method: "cash", date: "2026-10-13" } } });
  const scope = { concertIds: ["a", "b"], from: "2026-12-31", to: "2027-01-01", dateField: "date" as const, financialOnly: true };
  const original = await buildSalesWorkbook(fixture, 2026, "name,date,price,paid,due", scope);
  if (process.env.FILTERED_SALES_QA_PATH) await original.xlsx.writeFile(process.env.FILTERED_SALES_QA_PATH);
  const wb = await roundTrip(original);
  assert.deepEqual(wb.worksheets.map(s => s.name), ["ديسمبر 2026", "يناير 2027", "ملخص الفترة"]);
  assert.equal(wb.getWorksheet("ديسمبر 2026")!.getCell("A4").value,"حفلة نهاية السنة");
  assert.equal(wb.getWorksheet("يناير 2027")!.getCell("A4").value,"حفلة بداية السنة");
  const summary = wb.getWorksheet("ملخص الفترة")!;
  assert.equal(summary.getCell("A4").value,"ديسمبر 2026");
  assert.equal(summary.getCell("A5").value,"يناير 2027");
  assert.equal(summary.getCell("B6").value, 2);
  assert.equal(summary.getCell("D6").value, 3000);
  assert.equal(summary.getCell("G6").value, 500);
  assert.equal(summary.getCell("H6").value, 2500);
  assert.equal(summary.getCell("H4").value,1000);
  assert.equal(summary.getCell("H5").value,1500);
  assert.ok(!allValues(wb).includes("خارج الفلتر"));
  assert.match(String(summary.getCell("A2").value), /2026-12-31.*2027-01-01/);
  const created = await buildSalesWorkbook(fixture, 2026, null, { ...scope, dateField: "createdAt", from: "2026-10-13", to: "2026-10-13" });
  assert.deepEqual(created.worksheets.map(s=>s.name),["أكتوبر 2026","ملخص الفترة"]);
  await assert.rejects(buildSalesWorkbook(fixture, 2026, null, { ...scope, to: "2026-12-31" }), /خارج الفلاتر/);
  await assert.rejects(buildSalesWorkbook(fixture, 2026, null, { ...scope, concertIds: ["missing"] }), /تغيّرت قائمة/);
  await assert.rejects(buildSalesWorkbook(fixture, 2026, null, { ...scope, concertIds: ["cancelled"] }), /خارج الفلاتر/);
  const all = await buildSalesWorkbook(fixture, 2026, null, { ...scope, from: "", to: "" });
  assert.equal(all.getWorksheet("ملخص الفترة")!.getCell("H6").value, 2500);
});

test("monthly filtered sheets separate identical months in different years and use Riyadh boundaries", async () => {
  const fixture=fakeDb({concerts:{
    old:{name:"قديم",date:"2026-01-01",price:100,status:"confirmed"},
    boundary:{name:"حد السنة",date:"2026-12-31T21:00:00Z",price:200,status:"confirmed"},
    next:{name:"الجديد",date:"2027-01-05",price:300,status:"cancelled"},
    missing:{name:"بلا موعد",date:null,price:50,status:"confirmed"},
  }});
  const wb=await roundTrip(await buildSalesWorkbook(fixture,2026,"name,date,due",{
    concertIds:["missing","next","old","boundary"],dateField:"date",from:"",to:"",financialOnly:false,
  }));
  assert.deepEqual(wb.worksheets.map(s=>s.name),["يناير 2026","يناير 2027","بلا تاريخ","ملخص الفترة"]);
  assert.equal(wb.getWorksheet("يناير 2026")!.getCell("A4").value,"قديم");
  const next=wb.getWorksheet("يناير 2027")!;
  const rows=next.getRows(4,2)!;
  assert.equal(rows.find(r=>r.getCell(1).value==="حد السنة")!.getCell(2).value instanceof Date,true);
  assert.equal((rows.find(r=>r.getCell(1).value==="حد السنة")!.getCell(2).value as Date).toISOString().slice(0,10),"2027-01-01");
  assert.equal(rows.find(r=>r.getCell(1).value==="الجديد")!.getCell(3).value,0);
  const summary=wb.getWorksheet("ملخص الفترة")!;
  assert.equal(summary.getCell("B7").value,4);
  assert.equal(summary.getCell("H7").value,350);
  assert.equal(next.getRow(6).getCell(3).value,200);
});

const db = fakeDb({
  concerts: {
    c1: {
      concertNumber: 1, name: "حفلة الاختبار", date: "2026-10-05", clientName: "عميل الاختبار",
      clientPhone: "0500000000", venueName: "قاعة الاختبار", status: "confirmed", price: 1_150,
      vatRate: 15, hallCostType: "fixed", hallCostValue: 100, supervisorIds: ["u1"], employeeIds: [],
    },
  },
  concert_payments: { p1: { concertId: "c1", amount: 500, date: "2026-10-01", method: "cash", receiverName: "أمين" } },
  concert_food: { f1: { concertId: "c1", categoryName: "وجبات", selectedOption: "وجبة أرز", quantity: 10 } },
  users: { u1: { name: "المشرف الأول" } },
  cost_items: {
    RAW001: { name: "أرز", kind: "raw", unit: "جم", totalIn: 1_000, totalOut: 100, totalInValue: 900 },
    PRD001: { name: "وجبة أرز", kind: "sale", unit: "حبة", totalIn: 10, totalOut: 2, totalInValue: 160, salesSections: ["restaurant"] },
  },
  cost_incoming: {
    i1: { itemBarcode: "RAW001", itemName: "أرز", unit: "جم", quantity: 1_000, priceBeforeVat: 0.9, totalBeforeVat: 900, supplierName: "مورد", invoiceDate: "2026-10-01" },
  },
  cost_outgoing: {
    o1: { itemBarcode: "RAW001", itemName: "أرز", unit: "جم", quantity: 100, unitPrice: 0.9, totalCost: 90, departmentName: "الحفلات", channel: "concerts", concertId: "c1", concertName: "حفلة الاختبار", clientName: "عميل الاختبار", dispenseDate: "2026-10-05" },
  },
  cost_production: {
    pr1: { outputBarcode: "PRD001", outputName: "وجبة أرز", outputUnit: "حبة", outputQty: 10, totalCost: 160, unitCost: 16, productionDate: "2026-10-03", inputs: [{ itemName: "أرز", qty: 1_000, unit: "جم" }] },
  },
  cost_damage: {
    d1: { itemBarcode: "RAW001", itemName: "أرز", unit: "جم", quantity: 5, unitCost: 0.9, totalCost: 4.5, source: "store", damageDate: "2026-10-04", reason: "اختبار" },
  },
  warehouse_items: {
    w1: { name: "طاولة", type: "internal", totalCount: 10, availableCount: 7, pricePerUnit: 50, order: 1 },
  },
  sales_sections: {
    restaurant: { name: "الوجبات", channel: "restaurant", order: 1, itemOrder: ["PRD001"] },
  },
});

test("كل مسارات Excel الرئيسية تنتج ملفات XLSX قابلة للفتح وببيانات ممثلة", async () => {
  const sales = await roundTrip(await buildSalesWorkbook(db, 2026, "no,name,client,price,paid,raw"));
  const salesValues = allValues(sales);
  assert.ok(salesValues.includes("حفلة الاختبار"));
  assert.ok(salesValues.includes("عميل الاختبار"));
  assert.ok(salesValues.includes(1_150));
  assert.ok(salesValues.includes(500));

  const costs = await roundTrip(await buildCostsWorkbook(db, 2026, "date,kind,item,barcode,qty,total"));
  const costValues = allValues(costs);
  assert.ok(costValues.includes("أرز"));
  assert.ok(costValues.includes("وارد"));
  assert.ok(costValues.includes("منصرف"));
  assert.ok(costValues.includes("إنتاج"));
  assert.ok(costValues.includes("تالف"));

  const warehouse = await roundTrip(await buildWarehouseWorkbook(db));
  assert.ok(allValues(warehouse).includes("طاولة"));

  const balance = await roundTrip(await buildBalanceWorkbook(db, true));
  assert.ok(allValues(balance).includes("RAW001"));

  const restaurant = await roundTrip(await buildRestaurantTemplateWorkbook(db));
  assert.ok(allValues(restaurant).includes("وجبة أرز"));
});
