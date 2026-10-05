import ExcelJS from "exceljs";
import type { ConcertCustomerSummary } from "@/lib/firestore/customers";
import { downloadBlob } from "@/lib/download-file";

const NAVY = "FF1C2D50";
const NAVY_SOFT = "FFEEF1F7";
const BORDER = "FFD8E0EB";
const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd/mm/yyyy";

function excelDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function buildCustomersWorkbook(customers: ConcertCustomerSummary[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام إدارة الحفلات";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("العملاء", {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 21 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.views = [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 4 }];

  sheet.mergeCells("A1:K1");
  const title = sheet.getCell("A1");
  title.value = "عملاء الحفلات";
  title.font = { name: "Arial", size: 15, bold: true, color: { argb: NAVY } };
  title.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(1).height = 28;

  const totalValue = customers.reduce((sum, customer) => sum + customer.totalValue, 0);
  const totalCollected = customers.reduce((sum, customer) => sum + customer.totalCollected, 0);
  const totalRemaining = customers.reduce((sum, customer) => sum + customer.totalRemaining, 0);
  sheet.getRow(2).values = [
    "عدد العملاء", customers.length,
    "عدد الحفلات", customers.reduce((sum, customer) => sum + customer.concertCount, 0),
    "إجمالي القيمة", totalValue,
    "المحصّل", totalCollected,
    "المتبقي", totalRemaining,
  ];
  for (const column of [1, 3, 5, 7, 9]) {
    const cell = sheet.getCell(2, column);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF64748B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
  }
  for (const column of [2, 4, 6, 8, 10]) {
    const cell = sheet.getCell(2, column);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    if (column >= 6) cell.numFmt = MONEY_FORMAT;
  }

  const headers = [
    "العميل", "الجوال الأساسي", "الجوال الإضافي", "تاريخ أول تسجيل",
    "المسجل بواسطة", "مصدر العميل", "عدد الحفلات", "إجمالي القيمة",
    "المحصّل", "المتبقي", "آخر حفلة",
  ];
  const rows = customers.map((customer) => [
    customer.name,
    customer.primaryPhone,
    customer.secondaryPhone ?? "",
    excelDate(customer.firstRegisteredAt),
    customer.firstCreatedByName,
    customer.source ?? "",
    customer.concertCount,
    customer.totalValue,
    customer.totalCollected,
    customer.totalRemaining,
    excelDate(customer.lastConcertAt),
  ]);

  sheet.addTable({
    name: "ConcertCustomersTable",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showColumnStripes: false },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows,
  });

  const header = sheet.getRow(4);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
  });

  for (let row = 5; row <= 4 + rows.length; row++) {
    sheet.getRow(row).height = 23;
    sheet.getRow(row).eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle" };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    });
  }

  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 17;
  sheet.getColumn(3).width = 17;
  sheet.getColumn(4).width = 17;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 13;
  sheet.getColumn(8).width = 17;
  sheet.getColumn(9).width = 17;
  sheet.getColumn(10).width = 17;
  sheet.getColumn(11).width = 17;

  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(3).numFmt = "@";
  sheet.getColumn(4).numFmt = DATE_FORMAT;
  sheet.getColumn(7).numFmt = "#,##0";
  for (const column of [8, 9, 10]) sheet.getColumn(column).numFmt = MONEY_FORMAT;
  sheet.getColumn(11).numFmt = DATE_FORMAT;
  sheet.getColumn(1).alignment = { horizontal: "right", vertical: "middle" };
  sheet.getColumn(5).alignment = { horizontal: "right", vertical: "middle" };
  sheet.getColumn(6).alignment = { horizontal: "right", vertical: "middle" };
  for (const column of [2, 3, 4, 7, 8, 9, 10, 11]) {
    sheet.getColumn(column).alignment = { horizontal: "center", vertical: "middle" };
  }

  sheet.autoFilter = { from: "A4", to: `K${Math.max(4, 4 + rows.length)}` };
  return workbook;
}

export async function downloadCustomersWorkbook(customers: ConcertCustomerSummary[]) {
  const workbook = await buildCustomersWorkbook(customers);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `عملاء-الحفلات-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
