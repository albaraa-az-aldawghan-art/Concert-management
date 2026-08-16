import ExcelJS from "exceljs";
import type { Firestore } from "firebase-admin/firestore";
import {
  ExportColumn, SALES_COLUMNS, COSTS_COLUMNS, BALANCE_COLUMNS, pickColumns,
} from "@/lib/server/export-columns";

/* ═══════════════════════════════════════════════════════════════
   بناء ملفات إكسل: ملف لكل سنة، اثنتا عشرة ورقة شهرية وورقة ملخص.

   الملف يُبنى عند كل طلب من البيانات الحيّة، فالرابط الثابت يعيد أحدث
   الأرقام دائماً — وهذا معنى «التحديث التلقائي»: لا نسخة مخزّنة تشيخ.

   الأرقام تُكتب أرقاماً حقيقية لا نصوصاً، مع تنسيق العملة والنِسَب، كي
   تعمل معادلات إكسل والجداول المحورية عليها مباشرة.
   ═══════════════════════════════════════════════════════════════ */

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const NAVY = "FF1C2D50";
const NAVY_SOFT = "FFEEF1F7";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** تنسيق العرض لكل نوع رقم — العملة بفاصلة آلاف ورقمين عشريين */
const FORMATS: Record<string, string> = {
  money: '#,##0.00',
  int: '#,##0',
  pct: '0.0%',
  date: 'yyyy-mm-dd',
};

/* ── أدوات مشتركة ── */

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    try { return (v as { toDate: () => Date }).toDate(); } catch { return null; }
  }
  if (typeof v === "object" && v !== null && "seconds" in v) {
    return new Date((v as { seconds: number }).seconds * 1000);
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return isNaN(t) ? null : new Date(t);
  }
  return null;
}

/** الشهر (0-11) لتاريخ ما، أو -1 إن كان خارج السنة المطلوبة */
function monthOf(d: Date | null, year: number): number {
  if (!d) return -1;
  return d.getFullYear() === year ? d.getMonth() : -1;
}

const STATUS_AR: Record<string, string> = {
  planned: "غير مؤكدة",
  confirmed: "مؤكدة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};
/** الحالات القديمة السبع تُترجم إلى الأربع المعتمدة */
function statusAr(s: string): string {
  if (STATUS_AR[s]) return STATUS_AR[s];
  return s === "cancelled" ? "ملغاة" : "مؤكدة";
}

/** ترويسة الورقة: صف عنوان عريض ثم صف رؤوس الأعمدة */
function writeHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 3 }];

  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14, color: { argb: NAVY } };
  t.height = 22;
  ws.mergeCells(t.number, 1, t.number, Math.max(colCount, 1));

  const s = ws.addRow([subtitle]);
  s.font = { size: 10, color: { argb: "FF64748B" } };
  ws.mergeCells(s.number, 1, s.number, Math.max(colCount, 1));
}

function writeColumnHeaders(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.addRow(labels);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD4DCE8" } } };
  });
  row.height = 20;
  return row.number;
}

function applyFormats(ws: ExcelJS.Worksheet, firstDataRow: number, lastRow: number, cols: { fmt?: string }[]) {
  for (let c = 0; c < cols.length; c++) {
    const fmt = cols[c].fmt ? FORMATS[cols[c].fmt as string] : null;
    if (!fmt) continue;
    for (let r = firstDataRow; r <= lastRow; r++) {
      ws.getCell(r, c + 1).numFmt = fmt;
    }
  }
}

/** صف مجاميع بخلفية فاتحة — يُجمع الأعمدة الرقمية المطلوبة فقط */
function writeTotalsRow(
  ws: ExcelJS.Worksheet,
  cols: ExportColumn[],
  rows: (string | number | Date | null)[][],
  label = "الإجمالي"
) {
  if (rows.length === 0) return;
  const values: (string | number | null)[] = cols.map((c, i) => {
    if (i === 0) return label;
    if (c.fmt === "money" || c.fmt === "int") {
      const sum = rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
      return r2(sum);
    }
    return null;
  });
  const row = ws.addRow(values);
  row.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    const fmt = cols[i - 1]?.fmt;
    if (fmt && FORMATS[fmt] && fmt !== "date") cell.numFmt = FORMATS[fmt];
  });
  return row;
}

/* ═══ تصدير المبيعات (الحفلات) ═══ */

export async function buildSalesWorkbook(
  db: Firestore,
  year: number,
  colsRaw: string | null
): Promise<ExcelJS.Workbook> {
  const cols = pickColumns(SALES_COLUMNS, colsRaw);

  const [concertsSnap, paymentsSnap, outgoingSnap, foodSnap] = await Promise.all([
    db.collection("concerts").get(),
    db.collection("concert_payments").get(),
    db.collection("cost_outgoing").get(),
    db.collection("concert_food").get(),
  ]);

  /* الدفعات وخامات التكاليف وأصناف الأكل تُجمَّع مرة واحدة حسب الحفلة */
  interface PayRow {
    amount: number; date: string; method: string; cardType: string | null;
    bankName: string | null; senderName: string | null; receiverName: string | null;
    invoiceNumber: string | null; hasInvoice: boolean | null;
  }
  const paysBy = new Map<string, PayRow[]>();
  for (const d of paymentsSnap.docs) {
    const p = d.data() as Record<string, unknown>;
    const cid = p.concertId as string;
    const arr = paysBy.get(cid) ?? [];
    arr.push({
      amount: (p.amount as number) ?? 0,
      date: (p.date as string) ?? "",
      method: (p.method as string) ?? "",
      cardType: (p.cardType as string) ?? null,
      bankName: (p.bankName as string) ?? null,
      senderName: (p.senderName as string) ?? null,
      receiverName: (p.receiverName as string) ?? null,
      invoiceNumber: (p.invoiceNumber as string) ?? null,
      hasInvoice: (p.hasInvoice as boolean) ?? null,
    });
    paysBy.set(cid, arr);
  }

  const METHOD_AR: Record<string, string> = {
    card: "شبكة", cash: "كاش", bank_transfer: "تحويل بنكي",
  };
  const CARD_AR: Record<string, string> = { visa: "فيزا", mada: "مدى" };

  /** وصف دفعة واحدة كاملاً: المبلغ والوسيلة والتاريخ وطرفها وفاتورتها */
  function payLine(p: PayRow): string {
    const bits = [
      `${p.amount.toLocaleString("en-US")} ريال`,
      METHOD_AR[p.method] ?? p.method,
      p.method === "card" ? (CARD_AR[p.cardType ?? ""] ?? "") : "",
      p.method === "bank_transfer" ? [p.bankName, p.senderName].filter(Boolean).join(" — ") : "",
      p.method === "cash" ? (p.receiverName ? `المستلم: ${p.receiverName}` : "") : "",
      p.date,
      p.invoiceNumber ? `فاتورة ${p.invoiceNumber}` : p.hasInvoice === false ? "بدون فاتورة" : "",
    ].filter(Boolean);
    return bits.join(" · ");
  }
  const rawBy = new Map<string, number>();
  for (const d of outgoingSnap.docs) {
    const o = d.data() as { concertId: string | null; totalCost: number };
    if (!o.concertId) continue;
    rawBy.set(o.concertId, (rawBy.get(o.concertId) ?? 0) + (o.totalCost ?? 0));
  }
  const foodBy = new Map<string, string[]>();
  for (const d of foodSnap.docs) {
    const f = d.data() as { concertId: string; categoryName: string; selectedOption: string; quantity: number | null };
    const label = `${f.selectedOption || f.categoryName}${f.quantity ? ` ×${f.quantity}` : ""}`;
    const arr = foodBy.get(f.concertId) ?? [];
    arr.push(label);
    foodBy.set(f.concertId, arr);
  }

  const users = await db.collection("users").get();
  const nameOf = new Map(users.docs.map((d) => [d.id, (d.data().name as string) ?? ""]));

  /** صف واحد لكل حفلة بالأعمدة المختارة */
  function rowFor(id: string, c: Record<string, unknown>): (string | number | Date | null)[] {
    const date = toDate(c.date);
    const vatRate = (c.vatRate as number) ?? 15;
    const price = (c.price as number) ?? 0;
    // نفس معادلة العقد حرفاً بحرف كي تتطابق الأرقام مع المطبوع
    const net = r2(price / (1 + vatRate / 100));
    const vat = r2(price - net);
    const pays = paysBy.get(id) ?? [];
    const paid = pays.reduce((s, p) => s + p.amount, 0);
    const raw = rawBy.get(id) ?? 0;
    const hall =
      c.hallCostType === "percentage"
        ? r2((price * ((c.hallCostValue as number) ?? 0)) / 100)
        : ((c.hallCostValue as number) ?? 0);
    const external = (c.externalItemsCost as number) ?? 0;
    const internal = (c.internalItemsValue as number) ?? 0;
    const transport = (c.transportCost as number) ?? 0;
    const labor = (c.laborCost as number) ?? 0;
    const otherExp = (c.otherExpensesCost as number) ?? 0;
    // المواد الداخلية أصول ترجع بعد الحفلة فلا تدخل التكلفة
    const costs = r2(hall + raw + external + transport + labor + otherExp);
    const profit = r2(net - costs);

    const V: Record<string, string | number | Date | null> = {
      no: (c.concertNumber as number) ?? null,
      name: (c.name as string) ?? "",
      date: date,
      weekday: date ? WEEKDAYS[date.getDay()] : "",
      client: (c.clientName as string) ?? "",
      phone: (c.clientPhone as string) ?? "",
      phone2: (c.clientPhone2 as string) ?? "",
      venue: (c.venueName as string) ?? "",
      people: (c.peopleCount as string) ?? "",
      status: statusAr(c.status as string),
      price: r2(price),
      vat,
      net,
      paid: r2(paid),
      due: r2(price - paid),
      payCount: pays.length,
      lastPay: pays.length ? toDate(pays.map((p) => p.date).sort().at(-1)!) : null,
      // كل دفعة سطر داخل الخلية، فيبقى صف الحفلة واحداً لا يتكرّر
      payMethods: pays.map((p) => METHOD_AR[p.method] ?? p.method).join(String.fromCharCode(10)),
      payDates: pays.map((p) => p.date).join(String.fromCharCode(10)),
      payAmounts: pays.map((p) => p.amount.toLocaleString("en-US")).join(String.fromCharCode(10)),
      payBanks: pays
        .map((p) => (p.method === "bank_transfer" ? p.bankName ?? "" : p.method === "card" ? CARD_AR[p.cardType ?? ""] ?? "" : ""))
        .join(String.fromCharCode(10)),
      paySenders: pays.map((p) => p.senderName ?? p.receiverName ?? "").join(String.fromCharCode(10)),
      invoiceNo: (c.invoiceNumber as string | null) ?? "",
      invoiceStatus:
        c.hasInvoice === false ? "بدون فاتورة"
        : c.hasInvoice === true ? (String(c.invoiceNumber ?? "").trim() ? "مسجّلة" : "لم تُسجَّل")
        : "",
      payDetails: pays.map(payLine).join(String.fromCharCode(10)),
      hall: r2(hall),
      raw: r2(raw),
      external: r2(external),
      internal: r2(internal),
      transport: r2(transport),
      labor: r2(labor),
      otherExp: r2(otherExp),
      costs,
      profit,
      margin: net > 0 ? r2(profit / net * 1000) / 1000 : 0,
      sups: ((c.supervisorIds as string[]) ?? []).map((u) => nameOf.get(u) ?? "").filter(Boolean).join("، "),
      emps: ((c.employeeIds as string[]) ?? []).map((u) => nameOf.get(u) ?? "").filter(Boolean).join("، "),
      food: (foodBy.get(id) ?? []).join("، "),
      notes: (c.notes as string) ?? "",
      refund: (c.refundAmount as number) ?? null,
      cancelWhy: (c.cancellationReason as string) ?? "",
    };
    return cols.map((col) => V[col.key] ?? null);
  }

  /* توزيع الحفلات على أشهر السنة المطلوبة */
  const byMonth: Record<number, (string | number | Date | null)[][]> = {};
  for (let m = 0; m < 12; m++) byMonth[m] = [];
  const monthlyStats = Array.from({ length: 12 }, () => ({
    count: 0, price: 0, vat: 0, net: 0, paid: 0, due: 0, costs: 0, profit: 0, cancelled: 0,
  }));

  for (const d of concertsSnap.docs) {
    const c = d.data() as Record<string, unknown>;
    const date = toDate(c.date);
    const m = monthOf(date, year);
    if (m < 0) continue;
    byMonth[m].push(rowFor(d.id, c));

    const vatRate = (c.vatRate as number) ?? 15;
    const price = (c.price as number) ?? 0;
    const net = r2(price / (1 + vatRate / 100));
    const pays = paysBy.get(d.id) ?? [];
    const paid = pays.reduce((s, p) => s + p.amount, 0);
    const hall = c.hallCostType === "percentage"
      ? r2((price * ((c.hallCostValue as number) ?? 0)) / 100)
      : ((c.hallCostValue as number) ?? 0);
    const costs = r2(hall + (rawBy.get(d.id) ?? 0) + ((c.externalItemsCost as number) ?? 0) +
      ((c.transportCost as number) ?? 0) + ((c.laborCost as number) ?? 0) + ((c.otherExpensesCost as number) ?? 0));

    const s = monthlyStats[m];
    s.count++;
    s.price += price;
    s.vat += r2(price - net);
    s.net += net;
    s.paid += paid;
    s.due += price - paid;
    s.costs += costs;
    s.profit += net - costs;
    if (c.status === "cancelled") s.cancelled++;
  }

  /* ── بناء المصنّف ── */
  const wb = new ExcelJS.Workbook();
  wb.creator = "الفريج لإدارة الفعاليات";
  wb.created = new Date();

  for (let m = 0; m < 12; m++) {
    const ws = wb.addWorksheet(MONTHS[m], { views: [{ rightToLeft: true }] });
    ws.columns = cols.map((c) => ({ width: c.width }));

    writeHeader(ws, `المبيعات — ${MONTHS[m]} ${year}`, `${byMonth[m].length} حفلة`, cols.length);
    const headerRow = writeColumnHeaders(ws, cols.map((c) => c.label));

    for (const r of byMonth[m]) {
      const row = ws.addRow(r);
      // أعمدة تفاصيل الدفعات متعددة الأسطر — بلا التفاف تظهر سطراً واحداً
      cols.forEach((c, ci) => {
        if (c.key.startsWith("pay") && c.key !== "payCount" && c.key !== "lastPay") {
          row.getCell(ci + 1).alignment = { wrapText: true, vertical: "top", horizontal: "right" };
        }
      });
    }
    const lastRow = headerRow + byMonth[m].length;
    applyFormats(ws, headerRow + 1, lastRow, cols);
    if (byMonth[m].length > 0) {
      ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } };
      writeTotalsRow(ws, cols, byMonth[m]);
    } else {
      ws.addRow(["لا توجد حفلات في هذا الشهر"]).font = { color: { argb: "FF94A3B8" }, italic: true };
    }
    ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headerRow }];
  }

  /* ── ورقة الملخص السنوي ── */
  const sum = wb.addWorksheet(`ملخص ${year}`, { views: [{ rightToLeft: true }] });
  const sumCols = [
    { label: "الشهر", width: 12 },
    { label: "عدد الحفلات", width: 12, fmt: "int" },
    { label: "الملغاة", width: 10, fmt: "int" },
    { label: "الإيرادات شاملة الضريبة", width: 20, fmt: "money" },
    { label: "الضريبة", width: 14, fmt: "money" },
    { label: "الصافي قبل الضريبة", width: 18, fmt: "money" },
    { label: "المحصَّل", width: 14, fmt: "money" },
    { label: "المتبقي", width: 14, fmt: "money" },
    { label: "التكاليف", width: 14, fmt: "money" },
    { label: "الربح", width: 14, fmt: "money" },
  ];
  sum.columns = sumCols.map((c) => ({ width: c.width }));
  writeHeader(sum, `ملخص المبيعات لسنة ${year}`, "مجاميع كل شهر ثم مجموع السنة", sumCols.length);
  const sumHeader = writeColumnHeaders(sum, sumCols.map((c) => c.label));

  const totals = { count: 0, cancelled: 0, price: 0, vat: 0, net: 0, paid: 0, due: 0, costs: 0, profit: 0 };
  for (let m = 0; m < 12; m++) {
    const s = monthlyStats[m];
    sum.addRow([
      MONTHS[m], s.count, s.cancelled, r2(s.price), r2(s.vat), r2(s.net),
      r2(s.paid), r2(s.due), r2(s.costs), r2(s.profit),
    ]);
    totals.count += s.count; totals.cancelled += s.cancelled; totals.price += s.price;
    totals.vat += s.vat; totals.net += s.net; totals.paid += s.paid;
    totals.due += s.due; totals.costs += s.costs; totals.profit += s.profit;
  }
  const totalRow = sum.addRow([
    "الإجمالي", totals.count, totals.cancelled, r2(totals.price), r2(totals.vat),
    r2(totals.net), r2(totals.paid), r2(totals.due), r2(totals.costs), r2(totals.profit),
  ]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
  });
  applyFormats(sum, sumHeader + 1, totalRow.number, sumCols);
  sum.views = [{ rightToLeft: true, state: "frozen", ySplit: sumHeader }];

  return wb;
}

/* ═══ تصدير التكاليف ═══ */

export async function buildCostsWorkbook(
  db: Firestore,
  year: number,
  colsRaw: string | null
): Promise<ExcelJS.Workbook> {
  const cols = pickColumns(COSTS_COLUMNS, colsRaw);

  const [itemsSnap, incSnap, outSnap, prodSnap, dmgSnap] = await Promise.all([
    db.collection("cost_items").get(),
    db.collection("cost_incoming").get(),
    db.collection("cost_outgoing").get(),
    db.collection("cost_production").get(),
    db.collection("cost_damage").get(),
  ]);

  const itemName = new Map(itemsSnap.docs.map((d) => [d.id, (d.data().name as string) ?? ""]));
  const itemUnit = new Map(itemsSnap.docs.map((d) => [d.id, (d.data().unit as string) ?? ""]));

  interface Move {
    date: Date | null; kind: string; item: string; barcode: string; unit: string;
    qty: number; price: number; total: number; party: string; client: string;
    /* الوجهة تخصّ المنصرف وحده — تبقى فارغة في الوارد والإنتاج والتالف */
    channel?: string;
    returned: number | null; damaged: number | null; note: string;
  }
  const moves: Move[] = [];

  for (const d of incSnap.docs) {
    const e = d.data() as Record<string, unknown>;
    moves.push({
      date: toDate(e.invoiceDate) ?? toDate(e.createdAt), kind: "وارد",
      item: (e.itemName as string) ?? itemName.get(e.itemBarcode as string) ?? "",
      barcode: (e.itemBarcode as string) ?? "", unit: (e.unit as string) ?? "",
      qty: (e.quantity as number) ?? 0, price: (e.priceBeforeVat as number) ?? 0,
      total: (e.totalBeforeVat as number) ?? 0, party: (e.supplierName as string) ?? "",
      client: "", returned: null, damaged: null, note: "",
    });
  }
  /* الوجهة كما تُعرض في الواجهة — والفارغة تُكتب صراحةً لا تُترك بيضاء */
  const CHANNEL_LABEL: Record<string, string> = {
    restaurant: "المطعم", concerts: "حفلة", contracts: "عقد", general: "عام",
  };
  for (const d of outSnap.docs) {
    const e = d.data() as Record<string, unknown>;
    moves.push({
      date: toDate(e.dispenseDate) ?? toDate(e.createdAt), kind: "منصرف",
      item: (e.itemName as string) ?? "", barcode: (e.itemBarcode as string) ?? "",
      unit: (e.unit as string) ?? "", qty: (e.quantity as number) ?? 0,
      price: (e.unitPrice as number) ?? 0, total: (e.totalCost as number) ?? 0,
      party: (e.departmentName as string) ?? "",
      channel: CHANNEL_LABEL[(e.channel as string) ?? ""] ?? "بلا وجهة",
      client: ((e.clientName as string) || (e.concertName as string) || (e.manualConcertName as string) || ""),
      returned: (e.returnedQty as number) ?? 0, damaged: (e.damagedQty as number) ?? 0, note: "",
    });
  }
  for (const d of prodSnap.docs) {
    const p = d.data() as Record<string, unknown>;
    const inputs = ((p.inputs as { itemName: string; qty: number; unit: string }[]) ?? [])
      .map((i) => `${i.itemName} ${i.qty}${i.unit}`).join(" + ");
    moves.push({
      date: toDate(p.productionDate) ?? toDate(p.createdAt), kind: "إنتاج",
      item: (p.outputName as string) ?? "", barcode: (p.outputBarcode as string) ?? "",
      unit: (p.outputUnit as string) ?? "", qty: (p.outputQty as number) ?? 0,
      price: (p.unitCost as number) ?? 0, total: (p.totalCost as number) ?? 0,
      party: "الإنتاج", client: "", returned: null, damaged: null,
      note: inputs + ((p.notes as string) ? ` — ${p.notes}` : ""),
    });
  }
  for (const d of dmgSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    moves.push({
      date: toDate(x.damageDate) ?? toDate(x.createdAt), kind: "تالف",
      item: (x.itemName as string) ?? "", barcode: (x.itemBarcode as string) ?? "",
      unit: (x.unit as string) ?? "", qty: (x.quantity as number) ?? 0,
      price: (x.unitCost as number) ?? 0, total: (x.totalCost as number) ?? 0,
      party: x.source === "store" ? "تلف المستودع" : "تلف بعد الصرف",
      client: ((x.clientName as string) || (x.concertName as string) || ""),
      returned: null, damaged: null, note: (x.reason as string) ?? "",
    });
  }

  const rowOf = (m: Move) => cols.map((c) => (m as unknown as Record<string, string | number | Date | null>)[c.key] ?? null);

  const byMonth: Record<number, Move[]> = {};
  for (let i = 0; i < 12; i++) byMonth[i] = [];
  for (const m of moves) {
    const mi = monthOf(m.date, year);
    if (mi >= 0) byMonth[mi].push(m);
  }
  for (let i = 0; i < 12; i++) {
    byMonth[i].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  }

  /** أرصدة كل صنف حتى نهاية شهر معيّن — تُحسب بإعادة تشغيل الحركات */
  function balancesUpTo(monthEnd: Date) {
    const st = new Map<string, { qty: number; value: number; inQty: number; outQty: number }>();
    const S = (b: string) => {
      if (!st.has(b)) st.set(b, { qty: 0, value: 0, inQty: 0, outQty: 0 });
      return st.get(b)!;
    };
    const upto = moves
      .filter((m) => m.date && m.date <= monthEnd)
      .sort((a, b) => (a.date!.getTime() - b.date!.getTime()));

    for (const m of upto) {
      const s = S(m.barcode);
      if (m.kind === "وارد" || m.kind === "إنتاج") {
        s.qty += m.qty; s.inQty += m.qty; s.value = r2(s.value + m.total);
      } else if (m.kind === "منصرف") {
        const net = m.qty - (m.returned ?? 0);
        const avg = s.qty > 0 ? s.value / s.qty : 0;
        s.qty -= net; s.outQty += net; s.value = r2(s.value - avg * net);
      } else if (m.kind === "تالف" && m.party === "تلف المستودع") {
        const avg = s.qty > 0 ? s.value / s.qty : 0;
        s.qty -= m.qty; s.outQty += m.qty; s.value = r2(s.value - avg * m.qty);
      }
    }
    return st;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "الفريج لإدارة الفعاليات";
  wb.created = new Date();

  const monthlyStats = Array.from({ length: 12 }, () => ({ inc: 0, out: 0, prod: 0, dmg: 0, moves: 0 }));

  for (let m = 0; m < 12; m++) {
    const ws = wb.addWorksheet(MONTHS[m], { views: [{ rightToLeft: true }] });
    ws.columns = cols.map((c) => ({ width: c.width }));

    const list = byMonth[m];
    writeHeader(ws, `التكاليف — ${MONTHS[m]} ${year}`, `${list.length} حركة`, cols.length);
    const headerRow = writeColumnHeaders(ws, cols.map((c) => c.label));

    for (const mv of list) ws.addRow(rowOf(mv));
    const lastRow = headerRow + list.length;
    applyFormats(ws, headerRow + 1, lastRow, cols);
    if (list.length > 0) {
      ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } };
      writeTotalsRow(ws, cols, list.map(rowOf));
    } else {
      ws.addRow(["لا توجد حركات في هذا الشهر"]).font = { color: { argb: "FF94A3B8" }, italic: true };
    }

    for (const mv of list) {
      const s = monthlyStats[m];
      s.moves++;
      if (mv.kind === "وارد") s.inc += mv.total;
      else if (mv.kind === "منصرف") s.out += mv.total;
      else if (mv.kind === "إنتاج") s.prod += mv.total;
      else if (mv.kind === "تالف") s.dmg += mv.total;
    }

    /* ── لقطة الأرصدة آخر الشهر ── */
    ws.addRow([]);
    const secTitle = ws.addRow([`أرصدة الأصناف في نهاية ${MONTHS[m]} ${year}`]);
    secTitle.font = { bold: true, size: 12, color: { argb: NAVY } };
    ws.mergeCells(secTitle.number, 1, secTitle.number, Math.max(BALANCE_COLUMNS.length, 1));

    const balHeader = writeColumnHeaders(ws, BALANCE_COLUMNS.map((c) => c.label));
    const monthEnd = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59));
    const bal = balancesUpTo(monthEnd);
    let balRows = 0;
    for (const [barcode, s] of [...bal.entries()].sort((a, b) =>
      (itemName.get(a[0]) ?? "").localeCompare(itemName.get(b[0]) ?? "", "ar"))) {
      if (s.inQty === 0 && s.outQty === 0) continue;
      ws.addRow([
        itemName.get(barcode) ?? "—", barcode, itemUnit.get(barcode) ?? "",
        r2(s.inQty), r2(s.outQty), r2(s.qty), r2(Math.max(0, s.value)),
        s.qty > 0 ? r2(s.value / s.qty) : 0,
      ]);
      balRows++;
    }
    if (balRows === 0) {
      ws.addRow(["لا توجد أرصدة بعد"]).font = { color: { argb: "FF94A3B8" }, italic: true };
    } else {
      applyFormats(ws, balHeader + 1, balHeader + balRows, BALANCE_COLUMNS);
    }
    ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headerRow }];
  }

  /* ── ملخص السنة ── */
  const sum = wb.addWorksheet(`ملخص ${year}`, { views: [{ rightToLeft: true }] });
  const sumCols = [
    { label: "الشهر", width: 12 },
    { label: "عدد الحركات", width: 12, fmt: "int" },
    { label: "قيمة الوارد", width: 16, fmt: "money" },
    { label: "قيمة المنصرف", width: 16, fmt: "money" },
    { label: "قيمة الإنتاج", width: 16, fmt: "money" },
    { label: "قيمة التالف", width: 16, fmt: "money" },
  ];
  sum.columns = sumCols.map((c) => ({ width: c.width }));
  writeHeader(sum, `ملخص التكاليف لسنة ${year}`, "مجاميع كل شهر ثم مجموع السنة", sumCols.length);
  const sumHeader = writeColumnHeaders(sum, sumCols.map((c) => c.label));

  const T = { moves: 0, inc: 0, out: 0, prod: 0, dmg: 0 };
  for (let m = 0; m < 12; m++) {
    const s = monthlyStats[m];
    sum.addRow([MONTHS[m], s.moves, r2(s.inc), r2(s.out), r2(s.prod), r2(s.dmg)]);
    T.moves += s.moves; T.inc += s.inc; T.out += s.out; T.prod += s.prod; T.dmg += s.dmg;
  }
  const tRow = sum.addRow(["الإجمالي", T.moves, r2(T.inc), r2(T.out), r2(T.prod), r2(T.dmg)]);
  tRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
  });
  applyFormats(sum, sumHeader + 1, tRow.number, sumCols);
  sum.views = [{ rightToLeft: true, state: "frozen", ySplit: sumHeader }];

  return wb;
}
