import ExcelJS from "exceljs";
import type { Firestore } from "firebase-admin/firestore";
import { svcContractMonth } from "@/lib/server/contract-ledger-core";

/* ═══════════════════════════════════════════════════════════════
   تصدير شهر العقد بتخطيط ورقة الإكسل الأصلية حرفياً:

     A تسلسلي · B الاسم · C سعر البيع · D وحدة الشد · E صنف المنتج
     F التكلفة · G الكمية   ثم لكل يوم خمسة أعمدة:
     الكمية المشتراة · التالف · الكمية المتبقية · اكمية المباع · مبلغ المبيع

   ثم كتلة التحصيل، ثم ذيل الشهر: الاجمالي · الجرد المتبقي · الاستهلاك.

   وفَرقان عن الأصل: عمود «التكلفة» يُملأ من متوسط الشراء المتحرك (كان
   فارغاً في الأوراق الستّ عشرة كلها)، وصفّا المطابقة يحملان المعادلة
   التي تُغلق فعلاً لا التي تعيد سالبَ المصروفات.
   ═══════════════════════════════════════════════════════════════ */

const NAVY = "FF1C2D50";
const NAVY_SOFT = "FFEEF1F7";
const MONEY = '#,##0.00';
const INT = '#,##0';
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const DAY_HEADERS = ["الكمية المشتراة", "التالف", "الكمية المتبقية", "اكمية المباع", "مبلغ المبيع"];
const FIXED = ["الرقم التسلسلي", "الاسم", "سعر البيع", "وحدة الشد", "صنف المنتج", "التكلفة", "الكمية"];

export async function buildContractMonthWorkbook(db: Firestore, contractId: string, month: string) {
  const m = await svcContractMonth(db, contractId, month);
  const wb = new ExcelJS.Workbook();
  wb.creator = "نظام إدارة الحفلات";
  const ws = wb.addWorksheet(month, { views: [{ rightToLeft: true, state: "frozen", xSplit: 7, ySplit: 5 }] });

  const dates = m.days.map((d) => d.date);
  const dayOf = new Map(m.days.map((d) => [d.date, d]));

  /* ── الترويسة: صف ٣ اليوم · صف ٤ التاريخ · صف ٥ أسماء الأعمدة ── */
  ws.getCell(2, 2).value = m.contractName;
  ws.getCell(2, 2).font = { bold: true, size: 13, color: { argb: NAVY } };

  FIXED.forEach((h, i) => {
    const c = ws.getCell(5, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 26;
  for (let i = 3; i <= 7; i++) ws.getColumn(i).width = 12;

  dates.forEach((date, di) => {
    const first = 8 + di * 5;
    const d = new Date(date + "T00:00:00");
    ws.getCell(3, first).value = WEEKDAYS[d.getDay()];
    ws.getCell(4, first).value = date;
    ws.mergeCells(3, first, 3, first + 4);
    ws.mergeCells(4, first, 4, first + 4);
    for (const r of [3, 4]) {
      const c = ws.getCell(r, first);
      c.alignment = { horizontal: "center" };
      c.font = { bold: true, color: { argb: NAVY } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    }
    DAY_HEADERS.forEach((h, hi) => {
      const c = ws.getCell(5, first + hi);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      ws.getColumn(first + hi).width = 13;
    });
  });

  /* ── كتلة الأصناف ── */
  let row = 6;
  const firstItemRow = row;
  m.items.forEach((it, i) => {
    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = it.itemName;
    ws.getCell(row, 3).value = it.salePrice;
    ws.getCell(row, 4).value = it.unit;
    ws.getCell(row, 5).value = it.category ?? "";
    ws.getCell(row, 6).value = it.soldQty > 0 ? Math.round((it.cost / it.soldQty) * 100) / 100 : 0;
    ws.getCell(row, 7).value = it.closing;
    ws.getCell(row, 3).numFmt = MONEY;
    ws.getCell(row, 6).numFmt = MONEY;
    ws.getCell(row, 7).numFmt = INT;

    dates.forEach((date, di) => {
      const line = (dayOf.get(date)?.lines ?? []).find((l) => l.barcode === it.barcode);
      if (!line) return;
      const c = 8 + di * 5;
      ws.getCell(row, c).value = line.supplied;
      ws.getCell(row, c + 1).value = line.damaged;
      ws.getCell(row, c + 2).value = line.remaining;
      ws.getCell(row, c + 3).value = line.sold;
      ws.getCell(row, c + 4).value = line.revenue;
      for (let k = 0; k < 4; k++) ws.getCell(row, c + k).numFmt = INT;
      ws.getCell(row, c + 4).numFmt = MONEY;
    });
    row++;
  });
  const lastItemRow = row - 1;

  /* ── ذيل الشهر: الأعمدة الثلاثة من الورقة الأصلية + التكلفة والربح ── */
  const tail = 8 + dates.length * 5;
  const tailHeads: [string, string][] = [
    ["الاجمالي", "المسحوبات"],
    ["الجرد المتبقي", `جرد ${month}`],
    ["الكمية", "الاستهلاك"],
    ["التكلفة", "من متوسط الشراء"],
    ["الربح", "الإجمالي − التكلفة"],
  ];
  tailHeads.forEach(([h, sub], i) => {
    ws.getCell(4, tail + i).value = sub;
    const c = ws.getCell(5, tail + i);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getColumn(tail + i).width = 14;
  });
  m.items.forEach((it, i) => {
    const r = firstItemRow + i;
    ws.getCell(r, tail).value = it.revenue;
    ws.getCell(r, tail + 1).value = it.closing;
    ws.getCell(r, tail + 2).value = it.soldQty;
    ws.getCell(r, tail + 3).value = it.cost;
    ws.getCell(r, tail + 4).value = Math.round((it.revenue - it.cost) * 100) / 100;
    ws.getCell(r, tail).numFmt = MONEY;
    ws.getCell(r, tail + 1).numFmt = INT;
    ws.getCell(r, tail + 2).numFmt = INT;
    ws.getCell(r, tail + 3).numFmt = MONEY;
    ws.getCell(r, tail + 4).numFmt = MONEY;
  });

  /* ── صف الإجمالي ── */
  row = lastItemRow + 2;
  const totalRow = row;
  ws.getCell(row, 2).value = "الإجمالي";
  ws.getCell(row, 2).font = { bold: true };
  dates.forEach((date, di) => {
    const c = ws.getCell(row, 8 + di * 5 + 4);
    c.value = dayOf.get(date)?.totals?.sales ?? 0;
    c.numFmt = MONEY;
    c.font = { bold: true };
  });
  ws.getCell(row, tail).value = m.totals.sales;
  ws.getCell(row, tail).numFmt = MONEY;
  ws.getCell(row, tail).font = { bold: true };
  row += 1;

  /* ── كتلة التحصيل والمصروفات والمطابقة ── */
  const put = (label: string, get: (d: (typeof m.days)[number]) => number, bold = false, fmt = MONEY) => {
    ws.getCell(row, 2).value = label;
    if (bold) ws.getCell(row, 2).font = { bold: true };
    dates.forEach((date, di) => {
      const d = dayOf.get(date);
      if (!d) return;
      const c = ws.getCell(row, 8 + di * 5 + 4);
      c.value = get(d);
      c.numFmt = fmt;
      if (bold) c.font = { bold: true };
    });
    row++;
  };

  put("عهدة", (d) => d.custody ?? 0);
  put("تحويل بنكى", (d) => d.collections?.bank_transfer ?? 0);
  put("مدي", (d) => d.collections?.mada ?? 0);
  put("فيزا", (d) => d.collections?.visa ?? 0);
  put("كاش", (d) => d.collections?.cash ?? 0);
  put("الإجمالي المحصَّل", (d) => d.totals?.collected ?? 0, true);
  for (const line of m.expenseLines) {
    const key = line.key;
    put(line.label, (d) => (d.expenses ?? []).find((e) => e.key === key)?.amount ?? 0);
  }
  put("خصم من المحصَّل", (d) => d.totals?.deducted ?? 0);
  put("مدفوع من الصندوق", (d) => d.totals?.paidFromTill ?? 0);
  put("المتوقَّع", (d) => d.totals?.expected ?? 0, true);
  put("الفرق", (d) => d.totals?.variance ?? 0, true);
  put("تكلفة ما صُرف", (d) => d.totals?.cost ?? 0);

  /* ── ملخص الشهر ── */
  row += 1;
  const summary: [string, number, string][] = [
    ["الإجمالي (المبيعات)", m.totals.sales, MONEY],
    ["الجرد المتبقي", m.totals.closingStock, INT],
    ["الاستهلاك (الكمية المباعة)", m.totals.soldQty, INT],
    ["تكلفة ما بيع", m.totals.cost, MONEY],
    ["المصروفات اليومية", m.totals.expenses, MONEY],
    ["ربح العقد", m.totals.profit, MONEY],
    ["المحصَّل", m.totals.collected, MONEY],
    ["فرق المطابقة", m.totals.variance, MONEY],
  ];
  for (const [label, value, fmt] of summary) {
    ws.getCell(row, 2).value = label;
    ws.getCell(row, 2).font = { bold: true, color: { argb: NAVY } };
    const c = ws.getCell(row, 3);
    c.value = value;
    c.numFmt = fmt;
    c.font = { bold: true };
    row++;
  }

  return { wb, contractName: m.contractName };
}
