import { createHash } from "node:crypto";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { isPurchaseRawItem } from "@/lib/purchase-options";
import { materialRemaining, materialRound as r2, materialSearchKey, materialState, type MaterialRequest, type MaterialRequestLine, type MaterialReceipt, type MaterialReceiptLine, type MaterialChoice } from "@/lib/material-requests";
import { materialSearchKeys, runMaterialStockTransaction } from "@/lib/server/material-stock-transaction";

type Row = FirebaseFirestore.DocumentData; // Validated at the service boundary.
const requests = "cost_material_requests";
const receipts = "cost_material_receipts";
const now = () => new Date().toISOString();
const revisionTime = (previous: string) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
export function materialId(value: unknown, label = "المعرّف"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ApiError(`${label} غير صحيح`);
  return value;
}
export function materialNumber(value: unknown, label: string, zero = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value > 1e9 || value < (zero ? 0 : 0.01) || Math.abs(r2(value) - value) > 1e-8) throw new ApiError(`${label}: أدخل رقمًا ${zero ? "صفرًا أو موجبًا" : "موجبًا"} بمنزلتين عشريتين كحد أقصى`);
  return value;
}
export function materialDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError(`${label} غير صحيح`);
  return value;
}
const text = (value: unknown, max = 1000) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new ApiError("النص أطول من المسموح");
  return value.trim();
};
function readRequest(snap: { exists: boolean; id: string; data: () => unknown }): MaterialRequest & Row {
  if (!snap.exists) throw new ApiError("طلب المواد غير موجود", 404);
  return { id: snap.id, ...(snap.data() as Row) } as MaterialRequest & Row;
}
export function requireMaterialOwner(request: { createdBy: string }, uid: string, all: boolean) {
  if (!all && request.createdBy !== uid) throw new ApiError("لا تملك صلاحية الوصول إلى هذا الطلب", 403);
}
function assertRaw(item: Row | undefined): asserts item is Row {
  if (!item || !isPurchaseRawItem(item)) throw new ApiError("يمكن طلب المواد الخام المسجلة فقط");
}
const balance = (i: Row) => r2((i.totalIn ?? 0) - (i.totalOut ?? 0));
function incomingValue(quantity: number, factor: number, price: number) {
  const value = r2(quantity / factor * price);
  if (!Number.isFinite(value) || value > 1e12) throw new ApiError("إجمالي المادة يتجاوز الحد المسموح؛ راجع الكمية والسعر");
  return value;
}
function counter(item: Row, field: string, delta: number) {
  const next = r2(Number(item[field] ?? 0) + delta);
  if (!Number.isFinite(next) || next < -0.001) throw new ApiError("تعذر مطابقة كميات الطلب؛ حدّث الصفحة وراجع السجل");
  return Math.max(0, next);
}
const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export type RequestInput = { operationId: string; requestDate: string; notes?: string; lines: { barcode: string; quantity: number; enteredUnit: "stock" | "purchase" }[] };
function cleanRequest(input: RequestInput) {
  const id = materialId(input.operationId);
  const requestDate = materialDate(input.requestDate, "تاريخ الطلب");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 30) throw new ApiError("أضف من 1 إلى 30 مادة في الطلب");
  const lines = input.lines.map(line => {
    if (line.enteredUnit !== "stock" && line.enteredUnit !== "purchase") throw new ApiError("وحدة الطلب غير صحيحة");
    return { barcode: materialId(line.barcode, "باركود المادة"), quantity: materialNumber(line.quantity, "الكمية"), enteredUnit: line.enteredUnit };
  });
  if (new Set(lines.map(l => l.barcode)).size !== lines.length) throw new ApiError("المادة مكررة في الطلب");
  return { id, requestDate, notes: text(input.notes), lines };
}
function makeLine(input: RequestInput["lines"][number], item: Row | undefined): MaterialRequestLine {
  assertRaw(item);
  const factor = Number(item.purchaseToIssue) > 0 ? Number(item.purchaseToIssue) : 1;
  const requested = r2(input.quantity * (input.enteredUnit === "purchase" ? factor : 1));
  materialNumber(requested, "الكمية بعد التحويل");
  return { barcode: input.barcode, name: item.name, unit: item.unit, purchaseUnit: item.purchaseUnit || item.unit, purchaseToIssue: factor,
    enteredUnit: input.enteredUnit, enteredQuantity: input.quantity, requested, received: 0, posted: 0, cancelled: 0, balanceAtRequest: balance(item), minimumAtRequest: item.minimumStock ?? 0 };
}
export async function createMaterialRequest(db: Firestore, uid: string, input: RequestInput) {
  const clean = cleanRequest(input), ref = db.collection(requests).doc(clean.id), fingerprint = hash(clean);
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.createdBy === uid && existing.data()?.operationHash === fingerprint) return;
      throw new ApiError("أُرسل هذا الطلب مسبقًا؛ افتح طلبًا جديدًا للتغييرات", 409);
    }
    const itemRefs = clean.lines.map(l => db.collection("cost_items").doc(l.barcode));
    const snaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    const lines = clean.lines.map((l, i) => makeLine(l, snaps[i].data()));
    const number = `MR-${ref.id}`, stamp = now();
    tx.create(ref, { number, source: "manual", state: "open", createdBy: uid, requestDate: clean.requestDate, notes: clean.notes, createdAt: stamp, updatedAt: stamp, lastReceivedAt: null, lines, operationHash: fingerprint, searchKeys: materialSearchKeys(number, lines) });
    lines.forEach((l, i) => tx.update(itemRefs[i], { materialOpenQuantity: counter(snaps[i].data()!, "materialOpenQuantity", l.requested), materialReferenced: true }));
  });
  return { id: ref.id };
}

export async function editMaterialRequest(db: Firestore, uid: string, all: boolean, id: string, input: RequestInput, revision: string) {
  const clean = cleanRequest(input), ref = db.collection(requests).doc(materialId(id));
  await db.runTransaction(async tx => {
    const old = readRequest(await tx.get(ref)); requireMaterialOwner(old, uid, all);
    if (old.updatedAt !== revision) throw new ApiError("تم تعديل الطلب؛ حدّثه قبل الحفظ", 409);
    if (old.lines.some(l => l.received > 0 || l.cancelled > 0) || old.state !== "open") throw new ApiError("لا يمكن تعديل الطلب بعد الاستلام أو الإلغاء");
    const barcodes = [...new Set([...old.lines.map(l => l.barcode), ...clean.lines.map(l => l.barcode)])];
    const refs = barcodes.map(b => db.collection("cost_items").doc(b));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    const items = new Map(barcodes.map((b, i) => [b, snaps[i].data()]));
    const lines = clean.lines.map(l => makeLine(l, items.get(l.barcode)!));
    barcodes.forEach((b, i) => {
      if (!snaps[i].exists) throw new ApiError("إحدى المواد غير موجودة");
      const delta = (lines.find(l => l.barcode === b)?.requested ?? 0) - (old.lines.find(l => l.barcode === b)?.requested ?? 0);
      tx.update(refs[i], { materialOpenQuantity: counter(items.get(b)!, "materialOpenQuantity", delta) });
    });
    tx.update(ref, { requestDate: clean.requestDate, notes: clean.notes, lines, updatedAt: revisionTime(old.updatedAt), searchKeys: materialSearchKeys(old.number, lines), operationHash: null });
  });
  return { id };
}

export async function cancelMaterialRequest(db: Firestore, uid: string, all: boolean, id: string, reason: string) {
  const ref = db.collection(requests).doc(materialId(id)), cleanReason = text(reason, 500);
  if (!cleanReason) throw new ApiError("اذكر سبب إلغاء المتبقي");
  await db.runTransaction(async tx => {
    const request = readRequest(await tx.get(ref)); requireMaterialOwner(request, uid, all);
    const refs = request.lines.map(l => db.collection("cost_items").doc(l.barcode));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    let changed = false;
    const lines = request.lines.map((line, i) => {
      const remaining = materialRemaining(line);
      if (!remaining) return line;
      changed = true;
      if (!snaps[i].exists) throw new ApiError("المادة غير موجودة");
      tx.update(refs[i], { materialOpenQuantity: counter(snaps[i].data()!, "materialOpenQuantity", -remaining) });
      return { ...line, cancelled: r2(line.cancelled + remaining) };
    });
    if (!changed) throw new ApiError("لا توجد كمية متبقية لإلغائها");
    tx.update(ref, { lines, state: materialState(lines), cancelReason: cleanReason, cancelledBy: uid, updatedAt: revisionTime(request.updatedAt) });
  });
  return { id };
}

export type ReceiptInput = { operationId: string; receivedDate: string; supplierName: string; notes?: string; lines: { barcode: string; quantity: number; enteredUnit: "stock" | "purchase" }[]; invoice?: { invoiceNumber: string; invoiceDate: string; prices: { barcode: string; priceBeforeVat: number }[] } };
function invoiceValues(input: NonNullable<ReceiptInput["invoice"]>, lines: MaterialReceiptLine[]) {
  const invoiceNumber = text(input.invoiceNumber, 150);
  if (!invoiceNumber) throw new ApiError("رقم الفاتورة مطلوب لاعتماد الاستلام");
  const invoiceDate = materialDate(input.invoiceDate, "تاريخ الفاتورة");
  if (!Array.isArray(input.prices) || input.prices.length !== lines.length || new Set(input.prices.map(p => p.barcode)).size !== lines.length) throw new ApiError("أدخل سعر كل مادة مرة واحدة");
  const prices = new Map(input.prices.map(p => [p.barcode, materialNumber(p.priceBeforeVat, "سعر وحدة الشراء", true)]));
  if (lines.some(l => !prices.has(l.barcode))) throw new ApiError("سعر إحدى المواد مفقود");
  return { invoiceNumber, invoiceDate, prices };
}

export async function receiveMaterialRequest(db: Firestore, uid: string, all: boolean, overreceive: boolean, id: string, input: ReceiptInput) {
  const ref = db.collection(requests).doc(materialId(id));
  const receiptRef = db.collection(receipts).doc(hash([id, materialId(input.operationId)]));
  const receivedDate = materialDate(input.receivedDate, "تاريخ الوصول"), supplierName = text(input.supplierName, 150);
  if (!supplierName) throw new ApiError("اختر المورد");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 30 || new Set(input.lines.map(l => l.barcode)).size !== input.lines.length) throw new ApiError("أضف المواد الواصلة دون تكرار");
  const fingerprint = hash(input);
  await runMaterialStockTransaction(db, async tx => {
    const [requestSnap, existing] = await Promise.all([tx.get(ref), tx.get(receiptRef)]);
    const request = readRequest(requestSnap); requireMaterialOwner(request, uid, all);
    if (existing.exists) {
      if (existing.data()?.operationHash === fingerprint && existing.data()?.createdBy === uid) return;
      throw new ApiError("تم حفظ هذه الدفعة مسبقًا", 409);
    }
    if (receivedDate < request.requestDate) throw new ApiError("تاريخ الوصول يسبق تاريخ الطلب");
    const selected = input.lines.map(l => {
      materialId(l.barcode); materialNumber(l.quantity, "الكمية الواصلة");
      if (l.enteredUnit !== "stock" && l.enteredUnit !== "purchase") throw new ApiError("وحدة الاستلام غير صحيحة");
      const original = request.lines.find(r => r.barcode === l.barcode);
      if (!original || original.cancelled > 0 || materialRemaining(original) === 0) throw new ApiError("المادة مكتملة أو ملغاة أو ليست في الطلب");
      const quantity = r2(l.quantity * (l.enteredUnit === "purchase" ? original.purchaseToIssue : 1));
      materialNumber(quantity, "الكمية بعد التحويل");
      if (quantity > materialRemaining(original) + 0.001 && !overreceive) throw new ApiError("استلام الزيادة يحتاج صلاحية مستقلة", 403);
      return { barcode: original.barcode, name: original.name, unit: original.unit, purchaseUnit: original.purchaseUnit, purchaseToIssue: original.purchaseToIssue, quantity } satisfies MaterialReceiptLine;
    });
    const itemRefs = selected.map(l => db.collection("cost_items").doc(l.barcode));
    const snaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    selected.forEach((l, i) => { assertRaw(snaps[i].data()); if (snaps[i].data()!.unit !== l.unit) throw new ApiError("تغيّرت وحدة المخزون؛ راجع الطلب قبل الاستلام"); });
    const invoice = input.invoice ? invoiceValues(input.invoice, selected) : null;
    if (invoice && invoice.invoiceDate < request.requestDate) throw new ApiError("تاريخ الفاتورة يسبق الطلب");
    const stamp = now(), newLines = request.lines.map(l => {
      const received = selected.find(s => s.barcode === l.barcode)?.quantity ?? 0;
      return { ...l, received: r2(l.received + received), posted: r2(l.posted + (invoice ? received : 0)) };
    });
    let total = 0;
    selected.forEach((line, i) => {
      const item = snaps[i].data()!, old = request.lines.find(l => l.barcode === line.barcode)!;
      const outstandingUsed = Math.min(line.quantity, materialRemaining(old));
      const patch: Row = { materialOpenQuantity: counter(item, "materialOpenQuantity", -outstandingUsed) };
      if (invoice) {
        const price = invoice.prices.get(line.barcode)!;
        const value = incomingValue(line.quantity, line.purchaseToIssue, price); total = r2(total + value);
        patch.totalIn = r2((item.totalIn ?? 0) + line.quantity); patch.totalInValue = r2((item.totalInValue ?? 0) + value);
        const incomingRef = db.collection("cost_incoming").doc();
        tx.create(incomingRef, incomingData(line, price, value, supplierName, invoice, receiptRef.id, id, uid));
      } else patch.materialPendingQuantity = counter(item, "materialPendingQuantity", line.quantity);
      tx.update(itemRefs[i], patch);
    });
    tx.create(receiptRef, { requestId: id, createdBy: uid, createdAt: stamp, receivedDate, supplierName, notes: text(input.notes), state: invoice ? "posted" : "awaiting_invoice", operationHash: fingerprint,
      lines: selected.map(l => invoice ? { ...l, priceBeforeVat: invoice.prices.get(l.barcode)! } : l), ...(invoice ? { invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, postedAt: stamp } : {}) });
    if (invoice) tx.create(db.collection("cost_purchase_invoices").doc(receiptRef.id), { invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, supplierName, lineCount: selected.length, totalBeforeVat: total, createdAt: new Date(stamp), createdBy: uid, materialRequestId: id, materialReceiptId: receiptRef.id });
    tx.set(db.collection("cost_settings").doc("suppliers"), { names: FieldValue.arrayUnion(supplierName) }, { merge: true });
    tx.update(ref, { lines: newLines, state: materialState(newLines), lastReceivedAt: request.lastReceivedAt && request.lastReceivedAt > receivedDate ? request.lastReceivedAt : receivedDate, updatedAt: revisionTime(request.updatedAt) });
  });
  return { id: receiptRef.id };
}
function incomingData(line: MaterialReceiptLine, price: number, value: number, supplierName: string, invoice: { invoiceNumber: string; invoiceDate: string }, receiptId: string, requestId: string, uid: string) {
  return { itemBarcode: line.barcode, itemName: line.name, unit: line.unit, dispenseUnit: line.unit, purchaseUnit: line.purchaseUnit, purchaseToIssue: line.purchaseToIssue,
    purchaseQuantity: line.quantity / line.purchaseToIssue, quantity: line.quantity, priceBeforeVat: price, totalBeforeVat: value, supplierName, invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate,
    invoiceId: receiptId, materialRequestId: requestId, materialReceiptId: receiptId, createdAt: new Date(), createdBy: uid };
}

export async function postMaterialInvoice(db: Firestore, uid: string, all: boolean, id: string, receiptId: string, input: NonNullable<ReceiptInput["invoice"]>) {
  const reqRef = db.collection(requests).doc(materialId(id)), receiptRef = db.collection(receipts).doc(materialId(receiptId));
  const fingerprint = hash(input);
  await runMaterialStockTransaction(db, async tx => {
    const [rSnap, eSnap] = await Promise.all([tx.get(reqRef), tx.get(receiptRef)]);
    const request = readRequest(rSnap); requireMaterialOwner(request, uid, all);
    if (!eSnap.exists || eSnap.data()!.requestId !== id) throw new ApiError("دفعة الاستلام غير موجودة", 404);
    const receipt = eSnap.data() as MaterialReceipt;
    if (receipt.state === "posted" && eSnap.data()!.invoiceOperationHash === fingerprint) return;
    if (receipt.state !== "awaiting_invoice") throw new ApiError("لا يمكن اعتماد هذه الدفعة مرة أخرى");
    const invoice = invoiceValues(input, receipt.lines);
    if (invoice.invoiceDate < request.requestDate) throw new ApiError("تاريخ الفاتورة يسبق الطلب");
    const itemRefs = receipt.lines.map(l => db.collection("cost_items").doc(l.barcode));
    const snaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    let total = 0;
    receipt.lines.forEach((line, i) => {
      const item = snaps[i].data(); assertRaw(item);
      if (item!.unit !== line.unit) throw new ApiError("وحدة الصنف تغيّرت؛ راجع الاستلام");
      const price = invoice.prices.get(line.barcode)!, value = incomingValue(line.quantity, line.purchaseToIssue, price); total = r2(total + value);
      tx.update(itemRefs[i], { materialPendingQuantity: counter(item!, "materialPendingQuantity", -line.quantity), totalIn: r2((item!.totalIn ?? 0) + line.quantity), totalInValue: r2((item!.totalInValue ?? 0) + value) });
      tx.create(db.collection("cost_incoming").doc(), incomingData(line, price, value, receipt.supplierName, invoice, receiptId, id, uid));
    });
    const lines = request.lines.map(l => ({ ...l, posted: r2(l.posted + (receipt.lines.find(s => s.barcode === l.barcode)?.quantity ?? 0)) }));
    const stamp = now();
    tx.update(reqRef, { lines, state: materialState(lines), updatedAt: revisionTime(request.updatedAt) });
    tx.update(receiptRef, { state: "posted", invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, postedAt: stamp, postedBy: uid, invoiceOperationHash: fingerprint, lines: receipt.lines.map(l => ({ ...l, priceBeforeVat: invoice.prices.get(l.barcode)! })) });
    tx.create(db.collection("cost_purchase_invoices").doc(receiptId), { invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, supplierName: receipt.supplierName, lineCount: receipt.lines.length, totalBeforeVat: total, createdAt: new Date(stamp), createdBy: uid, materialRequestId: id, materialReceiptId: receiptId });
  });
  return { id: receiptId };
}

export async function voidMaterialReceipt(db: Firestore, uid: string, all: boolean, id: string, receiptId: string, reason: string) {
  const reqRef = db.collection(requests).doc(materialId(id)), receiptRef = db.collection(receipts).doc(materialId(receiptId));
  const cleanReason = text(reason, 500); if (!cleanReason) throw new ApiError("سبب تصحيح الاستلام مطلوب");
  await db.runTransaction(async tx => {
    const [rSnap, eSnap] = await Promise.all([tx.get(reqRef), tx.get(receiptRef)]);
    const request = readRequest(rSnap); requireMaterialOwner(request, uid, all);
    if (!eSnap.exists || eSnap.data()!.requestId !== id) throw new ApiError("الاستلام غير موجود", 404);
    const receipt = eSnap.data() as MaterialReceipt;
    if (receipt.state === "void") throw new ApiError("تم إلغاء الاستلام مسبقًا");
    if (request.cancelReason) throw new ApiError("لا يمكن إلغاء دفعة بعد إلغاء متبقي الطلب؛ راجع الإدارة");
    const itemRefs = receipt.lines.map(l => db.collection("cost_items").doc(l.barcode));
    const snaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    const incoming = receipt.state === "posted" ? await tx.get(db.collection("cost_incoming").where("materialReceiptId", "==", receiptId)) : null;
    const latest = await tx.get(db.collection(receipts).where("requestId", "==", id).where("state", "in", ["posted", "awaiting_invoice"]).orderBy("receivedDate", "desc").limit(2));
    const lastReceivedAt = latest.docs.find(d => d.id !== receiptId)?.data().receivedDate ?? null;
    const lines = request.lines.map(l => {
      const quantity = receipt.lines.find(s => s.barcode === l.barcode)?.quantity ?? 0;
      return { ...l, received: r2(l.received - quantity), posted: r2(l.posted - (receipt.state === "posted" ? quantity : 0)) };
    });
    receipt.lines.forEach((line, i) => {
      const item = snaps[i].data(); if (!item) throw new ApiError("المادة غير موجودة");
      const oldLine = request.lines.find(l => l.barcode === line.barcode)!;
      const reopened = materialRemaining(lines.find(l => l.barcode === line.barcode)!) - materialRemaining(oldLine);
      const patch: Row = { materialOpenQuantity: counter(item, "materialOpenQuantity", reopened) };
      if (receipt.state === "posted") {
        if ((item.totalOut ?? 0) > 0 || balance(item) < line.quantity) throw new ApiError("لا يمكن عكس الاستلام بعد صرف المادة؛ يلزم إجراء تسوية معتمد");
        const entries = incoming!.docs.filter(d => d.data().itemBarcode === line.barcode);
        if (entries.length !== 1) throw new ApiError("تعذر مطابقة حركة الوارد");
        const entry = entries[0];
        patch.totalIn = r2(item.totalIn - line.quantity); patch.totalInValue = r2(item.totalInValue - entry.data().totalBeforeVat);
        if (patch.totalInValue < -0.001) throw new ApiError("تعذر مطابقة تكلفة المخزون");
        tx.delete(entry.ref);
      } else patch.materialPendingQuantity = counter(item, "materialPendingQuantity", -line.quantity);
      tx.update(itemRefs[i], patch);
    });
    if (receipt.state === "posted") tx.delete(db.collection("cost_purchase_invoices").doc(receiptId));
    tx.update(receiptRef, { state: "void", voidReason: cleanReason, voidedBy: uid, voidedAt: now() });
    tx.update(reqRef, { lines, state: materialState(lines), lastReceivedAt, updatedAt: revisionTime(request.updatedAt) });
  });
  return { id: receiptId };
}

export async function setMaterialPolicy(db: Firestore, uid: string, barcode: string, input: { enabled: boolean; minimumStock: number; targetStock: number }) {
  if (typeof input.enabled !== "boolean") throw new ApiError("حالة التفعيل غير صحيحة");
  const minimumStock = materialNumber(input.minimumStock, "الحد الأدنى", true), target = materialNumber(input.targetStock, "الرصيد المستهدف", true);
  if (input.enabled && target <= minimumStock) throw new ApiError("المستهدف يجب أن يكون أكبر من الحد الأدنى");
  const ref = db.collection("cost_items").doc(materialId(barcode));
  await runMaterialStockTransaction(db, async tx => {
    const snap = await tx.get(ref); assertRaw(snap.data());
    tx.update(ref, { materialAutoEnabled: input.enabled, materialTargetStock: target, minimumStock, materialPolicyBy: uid, materialPolicyAt: now() });
  });
  return { id: barcode };
}

export function materialChoice(id: string, item: Row): MaterialChoice {
  return { id, name: item.name, unit: item.unit, purchaseUnit: item.purchaseUnit || item.unit, purchaseToIssue: Number(item.purchaseToIssue) > 0 ? Number(item.purchaseToIssue) : 1,
    balance: balance(item), minimumStock: item.minimumStock ?? 0, openQuantity: item.materialOpenQuantity ?? 0, pendingInvoiceQuantity: item.materialPendingQuantity ?? 0, autoEnabled: item.materialAutoEnabled === true, targetStock: item.materialTargetStock ?? 0 };
}
export async function listMaterialChoices(db: Firestore) {
  const snap = await db.collection("cost_items").select("name","kind","unit","purchaseUnit","purchaseToIssue","totalIn","totalOut","minimumStock","materialOpenQuantity","materialPendingQuantity","materialAutoEnabled","materialTargetStock").get();
  return snap.docs.filter(d => isPurchaseRawItem(d.data())).map(d => materialChoice(d.id, d.data())).sort((a,b) => a.name.localeCompare(b.name, "ar"));
}
export async function listMaterialRequests(db: Firestore, uid: string, all: boolean, filters: { state?: string; q?: string; from?: string; to?: string; cursor?: string }) {
  let query = db.collection(requests) as FirebaseFirestore.Query;
  if (!all) query = query.where("createdBy", "==", uid);
  if (filters.state) {
    if (!["open","partial","awaiting_invoice","completed","cancelled"].includes(filters.state)) throw new ApiError("حالة غير صحيحة");
    query = query.where("state", "==", filters.state);
  }
  if (filters.q?.trim()) { const q = materialSearchKey(filters.q); if (q.length > 64) throw new ApiError("البحث طويل؛ استخدم بداية الاسم أو الباركود"); query = query.where("searchKeys", "array-contains", q); }
  if (filters.from) query = query.where("requestDate", ">=", materialDate(filters.from, "من تاريخ"));
  if (filters.to) query = query.where("requestDate", "<=", materialDate(filters.to, "إلى تاريخ"));
  if (filters.from && filters.to && filters.from > filters.to) throw new ApiError("نطاق التاريخ غير صحيح");
  query = query.orderBy("requestDate", "desc").orderBy(FieldPath.documentId(), "desc");
  if (filters.cursor) {
    if (filters.cursor.length > 1000) throw new ApiError("مؤشر الصفحة غير صحيح");
    let cursor: Row; try { cursor = JSON.parse(Buffer.from(filters.cursor, "base64url").toString()); } catch { throw new ApiError("مؤشر الصفحة غير صحيح"); }
    query = query.startAfter(materialDate(cursor.date, "مؤشر التاريخ"), materialId(cursor.id));
  }
  const snap = await query.limit(21).get(), page = snap.docs.slice(0, 20);
  const rows = page.map(d => {
    const data = { ...d.data() }; delete data.searchKeys; delete data.operationHash;
    return { id: d.id, ...data };
  });
  const last = page.at(-1);
  return { rows, nextCursor: snap.size > 20 && last ? Buffer.from(JSON.stringify({ date: last.data().requestDate, id: last.id })).toString("base64url") : null };
}

export async function getMaterialRequest(db: Firestore, uid: string, all: boolean, prices: boolean, id: string, cursor?: string) {
  const request = readRequest(await db.collection(requests).doc(materialId(id)).get()); requireMaterialOwner(request, uid, all);
  let q = db.collection(receipts).where("requestId", "==", id).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(21);
  if (cursor) {
    if (cursor.length > 1000) throw new ApiError("مؤشر الدفعات غير صحيح");
    let decoded: Row; try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { throw new ApiError("مؤشر الدفعات غير صحيح"); }
    if (typeof decoded.createdAt !== "string" || !Number.isFinite(Date.parse(decoded.createdAt))) throw new ApiError("مؤشر الدفعات غير صحيح");
    q = q.startAfter(decoded.createdAt, materialId(decoded.id));
  }
  const snaps = await q.get();
  const rows = snaps.docs.slice(0, 20).map(d => {
    const data = { ...d.data() }; delete data.operationHash; delete data.invoiceOperationHash;
    return { id: d.id, ...data, lines: (data.lines as MaterialReceiptLine[]).map((l): MaterialReceiptLine => { const safe = { ...l }; if (!prices) delete safe.priceBeforeVat; return safe; }) };
  });
  const refs = request.lines.map(l => db.collection("cost_items").doc(l.barcode));
  const itemSnaps = refs.length ? await db.getAll(...refs) : [];
  const safeRequest = { ...request }; delete safeRequest.searchKeys; delete safeRequest.operationHash;
  return { request: safeRequest, receipts: rows, nextReceiptCursor: snaps.size > 20 ? Buffer.from(JSON.stringify({id:snaps.docs[19].id,createdAt:snaps.docs[19].data().createdAt})).toString("base64url") : null, items: itemSnaps.filter(s => s.exists).map(s => materialChoice(s.id, s.data()!)) };
}
