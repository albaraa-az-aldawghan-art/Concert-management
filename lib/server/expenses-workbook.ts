import ExcelJS from "exceljs";
import { EXPENSE_DEPARTMENTS, EXPENSE_SOURCES, expenseExportTotals, type ExpenseExportFilters, type ExpenseExportRow } from "../expenses-export";

export async function buildExpensesWorkbook(rows: ExpenseExportRow[], filters: ExpenseExportFilters) {
  const book = new ExcelJS.Workbook();
  book.creator = "الفريج";
  book.calcProperties.fullCalcOnLoad = true;
  const summary = book.addWorksheet("ملخص المصاريف"), detail = book.addWorksheet("جميع المصاريف");
  const money = '[$-en-US]#,##0.00;[Red]-#,##0.00;0.00';
  function setup(sheet: ExcelJS.Worksheet, title: string, note: string, widths: number[], headers: string[]) {
    sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 4, showGridLines: false }];
    sheet.columns = widths.map(width => ({ width }));
    sheet.mergeCells(1, 1, 1, widths.length); sheet.getCell("A1").value = title; sheet.getRow(1).height = 32;
    sheet.mergeCells(2, 1, 2, widths.length); sheet.getCell("A2").value = `الفترة: ${filters.from || "البداية"} — ${filters.to || "جميع التواريخ"} | حسب تاريخ فاتورة المصروف / يوم تشغيل العقد | العملة: SAR`;
    sheet.getRow(2).height = 28;
    sheet.mergeCells(3, 1, 3, widths.length); sheet.getCell("A3").value = note; sheet.getRow(3).height = 52;
    sheet.getRow(4).values = headers; sheet.getRow(4).height = 36;
    sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: false, scale: 85, printTitlesRow: "4:4" };
    sheet.headerFooter.oddFooter = "&C&P / &N";
    sheet.properties.defaultRowHeight = 32;
  }
  setup(detail, "جميع المصاريف المسجلة", "سجل واحد لكل فاتورة أو بند يوم تشغيل، دون تكرار المجاميع المخزنة على الحفلات. ضريبة الشراء وطرق السداد والمستلم غير المحفوظة تبقى غير موثقة؛ لا تُفترض صفرًا. التكاليف التقديرية ومشتريات/صرف المخزون ليست دفعات نقدية إضافية في هذا التقرير.",
    [20, 26, 22, 30, 16, 20, 24, 26, 20, 20, 20, 22, 42, 42, 48, 36, 45, 28],
    ["التاريخ", "المصدر", "القسم", "الجهات المستفيدة", "رقم الحفلة / العقد / السند", "الحالة الحالية", "نوع المصروف", "المورد / المستلم المسجل", "المبلغ المسجل", "مدفوع موثق", "خصم من التحصيل", "مبلغ سداد غير موثق", "حالة الضريبة المسجلة", "توثيق السداد", "الوصف / الملاحظات", "معرف المسجّل", "مرجع السجل", "تنبيه بيانات"]);
  rows.forEach(r => {
    const row = detail.addRow([
      new Date(r.date + "T00:00:00Z"), EXPENSE_SOURCES[r.source], EXPENSE_DEPARTMENTS[r.department], r.allocations&&r.allocations.length>1?`${r.allocations.length} جهات - راجع ورقة توزيع السندات`:r.targetName,
      r.targetNumber, r.targetStatus, r.type, r.recipient || "غير مسجل", r.amount / 100, r.cash === null ? null : r.cash / 100,
      r.deduction / 100, r.cash === null ? r.amount / 100 : 0, r.taxNote, r.paymentNote, r.description || null, r.recordedBy || "غير مسجل", r.id, r.warning || null,
    ]);
    row.getCell(1).numFmt = '[$-en-US]yyyy-mm-dd';
    for (let col = 9; col <= 12; col++) row.getCell(col).numFmt = money;
    row.height = Math.max(42, Math.ceil(Math.max(r.description.length / 40, r.warning.length / 22, (r.allocations&&r.allocations.length>1?30:r.targetName.length) / 24, r.taxNote.length / 36, r.id.length / 40, r.recipient.length/20, r.type.length/20)) * 18 + 12);
  });
  const end = rows.length + 4, total = expenseExportTotals(rows);
  const sums = [total.amount, total.cash, total.deduction, total.undocumentedPayment];
  const totalRow = detail.addRow(["الإجمالي"]);
  for (let col = 9; col <= 12; col++) totalRow.getCell(col).value = { formula: rows.length ? `SUM(${String.fromCharCode(64 + col)}5:${String.fromCharCode(64 + col)}${end})` : "0", result: sums[col - 9] / 100 };
  for (let col = 9; col <= 12; col++) totalRow.getCell(col).numFmt = money;
  detail.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, end), column: 18 } };

  setup(summary, "ملخص المصاريف المسجلة", "يشمل سندات الصرف لكل الأقسام وفواتير الحفلات القديمة وبنود أيام التعاقدات. يُحتسب السند مرة واحدة مهما تعددت الجهات. المسودات والقيود الملغاة لا تُجمع ماليًا. الخصم من التحصيل ليس دفعًا، وسداد الفواتير القديمة غير موثق. الاستردادات تخصم من أصل السند في الفترة نفسها.",
    [28, 15, 23, 23, 23, 27], ["المصدر", "عدد السجلات", "المبلغ المسجل", "مدفوع موثق", "خصم من التحصيل", "مبلغ سداد غير موثق"]);
  const sources:ExpenseExportRow["source"][]=["concert_invoice","contract_day",...(rows.some(r=>r.source==="expense_voucher")?["expense_voucher" as const]:[])];
  for (const source of sources) {
    const t = expenseExportTotals(rows.filter(r => r.source === source));
    const row = summary.addRow([EXPENSE_SOURCES[source], t.count]);
    const values = [t.amount, t.cash, t.deduction, t.undocumentedPayment];
    for (let c = 3; c <= 6; c++) {
      const detailCol = String.fromCharCode(73 + c - 3);
      row.getCell(c).value = { formula: rows.length ? `SUMIFS('جميع المصاريف'!${detailCol}$5:${detailCol}$${end},'جميع المصاريف'!B$5:B$${end},A${row.number})` : "0", result: values[c - 3] / 100 };
      row.getCell(c).numFmt = money;
    }
  }
  const lastSource=4+sources.length;
  const st = summary.addRow(["الإجمالي", { formula: `SUM(B5:B${lastSource})`, result: total.count }]);
  for (let c = 3; c <= 6; c++) {
    const letter = String.fromCharCode(64 + c);
    st.getCell(c).value = { formula: `SUM(${letter}5:${letter}${lastSource})`, result: sums[c - 3] / 100 }; st.getCell(c).numFmt = money;
  }
  const noteRow=st.number+2;summary.mergeCells(noteRow,1,noteRow+1,6); summary.getCell(noteRow,1).value = "سداد وارد المخزون يظهر كدفعة موثقة وليس تكلفة إضافية. المبلغ المسجل يمثل مبالغ السجلات ولا يساوي تكلفة الربح قبل الضريبة. ضريبة المشتريات القديمة غير الموثقة لا تُستنتج من ضريبة مبيعات الحفلة.";
  summary.getRow(noteRow).height = 34; summary.getRow(noteRow+1).height = 34;
  for (const sheet of [summary, detail]) {
    sheet.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Arial", size: 11, color: { argb: "FF1C2D50" } };
      cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      if (row.number === 4) cell.alignment.horizontal = "center";
      if (row.number === 1 || row.number === 4 || row.number === (sheet === detail ? totalRow.number : st.number)) {
        cell.font = { name: "Arial", size: row.number === 1 ? 14 : 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C2D50" } };
      } else if (row.number >= 5 && row.number % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    }));
  }
  if(rows.some(r=>r.allocations)){
    const split=book.addWorksheet("توزيع السندات");setup(split,"تفاصيل توزيع سندات الصرف","هذه حصص السندات وليست مصروفات إضافية إلى ورقة جميع المصاريف. المسودات والقيود الملغاة تظهر بحصص مالية صفرية.",[28,20,24,42,20,20,20],["رقم السند","تاريخ السند","القسم","الجهة المستفيدة","الصافي","الضريبة","حصة المدفوع"]);
    for(const r of rows)for(const a of r.allocations??[]){const line=split.addRow([r.voucherNumber,new Date(r.date+"T00:00:00Z"),EXPENSE_DEPARTMENTS[r.department],a.name,a.net/100,a.tax/100,a.gross/100]);line.height=Math.max(45,Math.ceil(a.name.length/35)*18+8);line.getCell(2).numFmt='[$-en-US]yyyy-mm-dd';for(let col=5;col<=7;col++)line.getCell(col).numFmt=money;line.eachCell(cell=>{cell.font={name:"Arial",size:11};cell.alignment={horizontal:"right",vertical:"middle",wrapText:true};if(line.number%2===1)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F5F9"}};});}
    for(const index of[1,2,3])split.getRow(index).eachCell(c=>{c.font={name:"Arial",size:index===1?14:11,bold:index===1,color:{argb:index===1?"FFFFFFFF":"FF1C2D50"}};c.alignment={horizontal:"right",vertical:"middle",wrapText:true};if(index===1)c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1C2D50"}};});
    split.getRow(4).eachCell(c=>{c.font={name:"Arial",size:11,bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1C2D50"}};});
    split.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,split.rowCount),column:7}};
  }
  return book;
}
