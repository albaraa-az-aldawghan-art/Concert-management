import assert from "node:assert/strict";
import test from "node:test";
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
  return { collection } as unknown as Firestore;
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
