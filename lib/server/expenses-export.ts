import type { Firestore } from "firebase-admin/firestore";
import { ApiError } from "./guard";
import type { ExpenseExportFilters, ExpenseExportRow } from "../expenses-export";
import { VOUCHER_METHODS,VOUCHER_STATES,type ExpenseVoucher } from "../expense-vouchers";

const LIMIT = 5000;
export function exportExpenseDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) {
    throw new ApiError(`${label}: تاريخ غير صحيح`);
  }
  return value;
}
export function expenseExportFilters(value: unknown): ExpenseExportFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("فترة التصدير غير صحيحة");
  const f = value as Record<string, unknown>;
  const from = f.from === "" || f.from === undefined ? "" : exportExpenseDate(f.from, "من تاريخ");
  const to = f.to === "" || f.to === undefined ? "" : exportExpenseDate(f.to, "إلى تاريخ");
  if (from && to && from > to) throw new ApiError("تاريخ البداية يجب أن يسبق النهاية");
  return { from, to };
}
export function expenseHalalas(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new ApiError(`${label}: مبلغ غير صحيح؛ راجع السجل قبل التصدير`);
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.0001) throw new ApiError(`${label}: المبلغ يحتوي أجزاء أصغر من الهللة؛ راجع السجل`);
  return cents;
}
const text = (value: unknown) => typeof value === "string" ? value : "";
type Doc = { id: string; data: Record<string, unknown> };
const status = (value: unknown) => ({ cancelled: "ملغاة", completed: "مكتملة", confirmed: "مؤكدة", planned: "غير مؤكدة", active: "ساري", expired: "منتهي" }[text(value)] ?? text(value));

/** Pure mapping is also tested against saved legacy records, including orphans.
 * No rows are read from cached concert costs, outgoing stock or monthly totals. */
export function normalizeExpenseExport(invoices: Doc[], days: Doc[], concerts: Map<string, Record<string, unknown>>, contracts: Map<string, Record<string, unknown>>): ExpenseExportRow[] {
  const rows: ExpenseExportRow[] = [];
  for (const { id, data: e } of invoices) {
    if(e.voucherId)continue; // canonical voucher is counted once, not once per beneficiary
    const date = exportExpenseDate(e.invoiceDate, `الفاتورة ${id}`);
    const amount = expenseHalalas(e.amount, `الفاتورة ${id}`);
    const targetId = text(e.concertId), c = concerts.get(targetId);
    if (typeof e.vatIncluded !== "boolean") throw new ApiError(`الفاتورة ${id}: حالة الضريبة غير مسجلة؛ راجع السجل`);
    rows.push({
      id: `concert_expenses/${id}`, source: "concert_invoice", department: "concerts", date, targetId,
      targetName: text(c?.name) || text(c?.clientName) || text(e.clientName) || "اسم الحفلة غير مسجل",
      targetNumber: String(c?.concertNumber ?? e.concertNumber ?? ""), targetStatus: c ? status(c.status) : "سجل الحفلة غير موجود",
      type: text(e.type) || "غير مصنف", recipient: text(e.supplierName), description: text(e.description), amount,
      cash: null, deduction: 0,
      taxNote: e.vatIncluded ? "المبلغ مسجل شامل الضريبة؛ نسبة ضريبة الشراء غير محفوظة" : "المبلغ مسجل غير شامل الضريبة؛ ضريبة الشراء غير موثقة",
      paymentNote: "السداد غير موثق في سجل الفاتورة", recordedBy: text(e.createdBy),
      warning: c ? "" : "تعذر العثور على الحفلة؛ حُفظت الفاتورة في التقرير ولم تُستبعد",
    });
  }
  for (const { id, data: d } of days) {
    const date = exportExpenseDate(d.date, `يوم التشغيل ${id}`);
    if (!Array.isArray(d.expenses)) {
      if (d.expenses == null && !(d.totals as Record<string, unknown> | undefined)?.expenses) continue;
      throw new ApiError(`يوم التشغيل ${id}: تفاصيل المصروفات غير موجودة`);
    }
    if (d.expenses.length > 100) throw new ApiError(`يوم التشغيل ${id}: تجاوز عدد بنود المصروفات 100 بند؛ راجع السجل`);
    const seen = new Set<string>(); let sum = 0;
    for (const entry of d.expenses) {
      if (!entry || typeof entry !== "object") throw new ApiError(`يوم التشغيل ${id}: مصروف غير صحيح`);
      const e = entry as Record<string, unknown>, key = text(e.key);
      if (!key || seen.has(key)) throw new ApiError(`يوم التشغيل ${id}: بند مفقود أو مكرر`);
      seen.add(key);
      const amount = expenseHalalas(e.amount, `يوم التشغيل ${id} / ${key}`);
      sum += amount;
      if (!amount) continue;
      if (e.kind !== "from_till" && e.kind !== "deduct_collected") throw new ApiError(`يوم التشغيل ${id}: نوع المصروف ${key} غير معروف`);
      const targetId = text(d.contractId), c = contracts.get(targetId), deduction = e.kind === "deduct_collected";
      rows.push({
        id: `contract_days/${id}/${key}`, source: "contract_day", department: "contracts", date, targetId,
        targetName: text(c?.name) || "اسم العقد غير مسجل", targetNumber: String(c?.contractNumber ?? ""), targetStatus: c ? status(c.status) : "سجل العقد غير موجود",
        type: text(e.label) || key, recipient: "", description: text(d.notes), amount, cash: deduction ? 0 : amount, deduction: deduction ? amount : 0,
        taxNote: "لم تُسجّل تفاصيل الضريبة في يوم التشغيل", paymentNote: deduction ? "خصم من التحصيل؛ ليس دفعًا نقديًا" : "من الصندوق؛ المستلم وطريقة الدفع غير موثقين",
        recordedBy: text(d.updatedBy) || text(d.createdBy), warning: c ? "" : "تعذر العثور على العقد؛ أُبقي المصروف في التقرير",
      });
    }
    const savedTotal = (d.totals as Record<string, unknown> | undefined)?.expenses;
    if (savedTotal !== undefined && expenseHalalas(savedTotal, `إجمالي يوم التشغيل ${id}`) !== sum) throw new ApiError(`يوم التشغيل ${id}: إجمالي المصروفات لا يطابق تفاصيله؛ صحّح السجل قبل التصدير`);
  }
  if (rows.length > 25000) throw new ApiError("تجاوز التقرير 25000 بند؛ اختر فترة أقصر. لم يُصدَّر ملف ناقص");
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new ApiError("توجد سجلات مصروفات مكررة؛ تعذر إصدار ملف دقيق");
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function readExpenseExport(db: Firestore, filters: ExpenseExportFilters): Promise<ExpenseExportRow[]> {
  async function read(collection: string, dateField: string) {
    let q: FirebaseFirestore.Query = db.collection(collection);
    if (filters.from) q = q.where(dateField, ">=", filters.from);
    if (filters.to) q = q.where(dateField, "<=", filters.to);
    const snap = await q.limit(LIMIT + 1).get();
    if (snap.size > LIMIT) throw new ApiError("تجاوز التقرير 5000 سجل في أحد المصادر؛ اختر فترة أقصر. لم يُصدَّر ملف ناقص");
    return snap.docs.map(d => ({ id: d.id, data: d.data() }));
  }
  const [invoices, days, vouchers] = await Promise.all([read("concert_expenses", "invoiceDate"), read("contract_days", "date"),read("expense_vouchers","date")]);
  const voucherIds=new Set(vouchers.map(v=>v.id));
  if(invoices.some(e=>e.data.voucherId&&!voucherIds.has(String(e.data.voucherId))))throw new ApiError("هناك مصروف مرتبط بسند غير موجود في الفترة؛ راجع ارتباط السند قبل التصدير");
  async function targets(collection: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const records = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < unique.length; i += 100) {
      const docs = await db.getAll(...unique.slice(i, i + 100).map(id => {
        if (id.includes("/") || id === "." || id === "..") throw new ApiError("معرف جهة المصروف غير صحيح");
        return db.collection(collection).doc(id);
      }));
      for (const doc of docs) if (doc.exists) records.set(doc.id, doc.data()!);
    }
    return records;
  }
  const [concerts, contracts] = await Promise.all([
    targets("concerts", invoices.map(i => text(i.data.concertId))),
    targets("contracts", days.map(d => text(d.data.contractId))),
  ]);
  const rows=normalizeExpenseExport(invoices, days, concerts, contracts);
  for(const doc of vouchers){const v=doc.data as unknown as ExpenseVoucher,posted=v.state==="posted",amount=posted?v.gross-v.refunded:0;
    if(!["draft","posted","void"].includes(v.state)||!Array.isArray(v.allocations)||![v.gross,v.net,v.tax,v.refunded].every(n=>Number.isSafeInteger(n)&&n>=0)||v.net+v.tax!==v.gross||v.refunded>v.gross||v.allocations.some(a=>![a.gross,a.net,a.tax].every(n=>Number.isSafeInteger(n)&&n>=0)||a.net+a.tax!==a.gross))throw new ApiError(`السند ${v.number||v.id}: بيانات مالية غير متطابقة؛ راجع السجل`);
    if(v.allocations.reduce((s,a)=>s+a.gross,0)!==v.gross-v.refunded)throw new ApiError(`السند ${v.number||v.id}: التوزيع لا يطابق المبلغ`);
    rows.push({id:`expense_vouchers/${v.id}`,source:"expense_voucher",department:v.department,date:v.date,targetId:v.id,targetName:v.allocations.map(a=>a.name).join("، "),targetNumber:v.number||"مسودة",targetStatus:VOUCHER_STATES[v.state],type:v.type,recipient:v.recipient,description:`${v.description} | الأصل ${v.gross/100} | المسترد ${v.refunded/100}`,amount,cash:amount,deduction:0,taxNote:v.vatMode==="none"?"بدون ضريبة":`صافي الأصل ${v.net/100}؛ الضريبة ${v.tax/100}؛ النسبة ${v.vatRate}%`,paymentNote:posted?VOUCHER_METHODS[v.method]:"غير محتسب؛ مسودة أو قيد ملغى",recordedBy:v.createdBy,warning:v.source==="inventory"?"سداد فاتورة مخزون مسجلة؛ لا يضيف تكلفة مخزون جديدة":"",allocations:v.allocations.map(a=>({name:a.name,gross:posted?a.gross:0,net:posted?a.net:0,tax:posted?a.tax:0})),voucherNumber:v.number||v.id});
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
