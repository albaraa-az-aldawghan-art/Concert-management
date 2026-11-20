import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildMaterialRequestsWorkbook,materialExportColumns } from "./material-requests-workbook";
import { cleanMaterialExportFilters } from "./material-requests-export";
import { MATERIAL_EXPORT_COLUMNS,materialExportRows,type MaterialExportData } from "../material-requests-export";
import type { MaterialRequestLine } from "../material-requests";

export function materialWorkbookFixture():MaterialExportData {
  const rice:MaterialRequestLine={barcode:"00042",name:"أرز بسمتي",unit:"كجم",purchaseUnit:"كيس",purchaseToIssue:10,enteredUnit:"stock",enteredQuantity:10,requested:10,received:6,posted:4,cancelled:0,balanceAtRequest:3,minimumAtRequest:2};
  const water={...rice,barcode:"WATER",name:"مياه",unit:"حبة",purchaseUnit:"كرتون",purchaseToIssue:24,received:5,posted:5};
  const request={id:"r1",number:"MR-1",source:"manual" as const,state:"partial" as const,createdBy:"owner",requestDate:"2026-11-01",createdAt:"",updatedAt:"",lastReceivedAt:"2026-11-10",notes:"=1+1",section:"restaurant" as const,assignedTo:"worker",assignedToName:"أحمد",lines:[rice,water]};
  const line=(item:MaterialRequestLine,quantity:number)=>({barcode:item.barcode,name:item.name,unit:item.unit,purchaseUnit:item.purchaseUnit,purchaseToIssue:item.purchaseToIssue,quantity,priceBeforeVat:999});
  const receipt={requestId:"r1",createdAt:"",createdBy:"owner",supplierName:"المورد",notes:"استلام جزئي"};
  return {filters:{basis:"delivery",from:"2026-11-10",to:"2026-11-10"},requests:[request,{...request,id:"r2",number:"MR-2",lines:[{...rice,received:0,posted:0,cancelled:2}]}],receipts:[
    {...receipt,id:"s1",state:"posted",receivedDate:"2026-11-01",invoiceNumber:"I1",invoiceDate:"2026-11-01",lines:[line(rice,4)]},
    {...receipt,id:"s2",state:"awaiting_invoice",receivedDate:"2026-11-10",lines:[line(rice,2)]},
    {...receipt,id:"s3",state:"posted",receivedDate:"2026-11-10",lines:[line(water,5)]},
    {...receipt,id:"void",state:"void",receivedDate:"2026-11-12",lines:[line(rice,100)]},
  ]};
}
test("Excel rows distinguish cumulative, period, pending, cancelled and remaining quantities and ignore void arrivals",()=>{
  const rows=materialExportRows(materialWorkbookFixture());
  assert.equal(rows.length,3);assert.equal(rows[0].received,6);assert.equal(rows[0].periodReceived,2);assert.equal(rows[0].posted,4);assert.equal(rows[0].pending,2);assert.equal(rows[0].remaining,4);
  assert.equal(rows[0].firstDelivery,"2026-11-01");assert.equal(rows[0].lastDelivery,"2026-11-10");assert.equal(rows[2].remaining,8);
});
test("workbook preserves selected columns, numeric/date types, leading-zero barcodes and text safely across an xlsx roundtrip",async()=>{
  const data=materialWorkbookFixture();
  const book=await buildMaterialRequestsWorkbook(data,["number","requestDate","assignedTo","barcode","name","unit","received","periodReceived","remaining","notes"],false,false);
  assert.equal(book.worksheets.length,1);const ws=book.worksheets[0];assert.equal(ws.columnCount,10);assert.equal(ws.rowCount,7);
  const headers=Array.from({length:ws.columnCount},(_,i)=>ws.getRow(4).getCell(i+1).value);
  assert.deepEqual(headers,["رقم الطلب","تاريخ الطلب","التوجيه / الموظف","باركود المادة","اسم المادة","وحدة المخزون","إجمالي الواصل حاليًا","الواصل خلال الفترة","المتبقي للتوريد حاليًا","ملاحظات الطلب"]);
  assert.ok(ws.getCell("B5").value instanceof Date);assert.equal(ws.getCell("D5").value,"00042");assert.equal(ws.getCell("G5").value,6);assert.equal(ws.getCell("J5").value,"=1+1");
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await book.xlsx.writeBuffer());
  assert.equal(reopened.worksheets[0].getCell("J5").type,ExcelJS.ValueType.String);
  assert.equal(reopened.worksheets[0].getCell("D5").value,"00042");assert.ok(reopened.worksheets[0].getCell("B5").value instanceof Date);
});
test("optional summary groups by material and unit, and delivery detail contains only active arrivals inside the selected delivery period",async()=>{
  const book=await buildMaterialRequestsWorkbook(materialWorkbookFixture(),MATERIAL_EXPORT_COLUMNS.map(c=>c.key),true,true);
  const summary=book.getWorksheet("ملخص المواد")!;assert.equal(summary.rowCount,6);
  assert.equal(summary.getCell("D5").value,20);assert.equal(summary.getCell("E5").value,6);assert.equal(summary.getCell("F5").value,2);assert.equal(summary.getCell("I5").value,12);
  const receipts=book.getWorksheet("دفعات التوريد")!;assert.equal(receipts.rowCount,6);assert.ok(receipts.getCell("D5").value instanceof Date);assert.equal(receipts.getCell("I5").value,2);assert.equal(receipts.getCell("I6").value,5);
  assert.ok(!JSON.stringify(book.model).includes("priceBeforeVat"));
});
test("export filters and column checklists reject malformed dates, reversed ranges and unknown or duplicated columns",()=>{
  assert.throws(()=>cleanMaterialExportFilters({basis:"request",from:"2026-02-30"}));assert.throws(()=>cleanMaterialExportFilters({basis:"delivery",from:"2026-11-10",to:"2026-11-01"}));
  assert.throws(()=>materialExportColumns([]));assert.throws(()=>materialExportColumns(["received","received"]));assert.throws(()=>materialExportColumns(["password"]));
  assert.deepEqual(materialExportColumns(["remaining","number"]),["number","remaining"]);
});
