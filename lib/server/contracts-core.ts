import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { productContractPrice } from "@/lib/contract-pricing";
import type { ContractType, ContractTerm, CostItem } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   التعاقدات على الخادم.

   العقد مثل الحفلة في المحاسبة: له قيمة ودفعات وتُحمَّل عليه خامات
   مصروفة — فربحيته تُحسب بنفس المعادلة. ويختلف عنها بأن له مدة وبنوداً
   متفقاً عليها مسبقاً (كذا وجبة بكذا سعر طوال الفصل الدراسي).

   البنود منتجات بيع لا نصوص: كل بند باركود من التكاليف، فتُعرف تكلفته
   ولا يُكتب في العقد صنف لا وجود له.
   ═══════════════════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

interface TermInput { barcode: string; quantity: number; unitPrice: number }

/** يبني البنود من الباركودات: الأسماء والوحدات من المصدر لا من العميل */
async function buildTerms(db: Firestore, terms: TermInput[], type?: ContractType, sectionId?: string | null, saved: ContractTerm[] = []) {
  const out = [];
  let total = 0;
  const seen = new Set<string>();
  for (const t of terms) {
    if (seen.has(t.barcode)) throw new ApiError("لا يمكن تكرار الصنف في بنود العقد");
    seen.add(t.barcode);
    if (!Number.isFinite(t.quantity) || t.quantity <= 0) throw new ApiError("كمية البند يجب أن تكون أكبر من صفر");
    const snap = await db.collection("cost_items").doc(t.barcode).get();
    if (!snap.exists) throw new ApiError(`صنف غير مسجّل في التكاليف: ${t.barcode}`);
    const x = snap.data()!;
    const previous = saved.find((term) => term.barcode === t.barcode);
    let unitPrice = t.unitPrice;
    if (type) {
      try {
        unitPrice = previous?.unitPrice ?? productContractPrice(x as CostItem, type, sectionId);
      } catch (error) {
        throw new ApiError(`${x.name ?? t.barcode}: ${(error as Error).message}`);
      }
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new ApiError("سعر البند غير صالح");
    const line = r2(t.quantity * unitPrice);
    total += line;
    out.push({
      ...(previous ?? {}),
      barcode: t.barcode,
      itemName: (x.name as string) ?? "",
      unit: (x.unit as string) ?? "",
      quantity: t.quantity,
      unitPrice,
      total: line,
    });
  }
  return { terms: out, total: r2(total) };
}

export async function svcCreateContract(
  db: Firestore,
  d: {
    name: string; clientName: string | null; clientPhone: string | null;
    startDate: string; endDate: string; vatRate: number | null;
    totalValue: number | null; terms: TermInput[]; notes: string | null; createdBy: string;
    contractType: ContractType; priceSectionId?: string | null;
  }
) {
  if (d.endDate < d.startDate) throw new ApiError("تاريخ نهاية العقد قبل بدايته");

  if (d.contractType !== "collected" && d.contractType !== "paid") throw new ApiError("اختر نوع العقد: محصّل أو مدفوع");
  let priceSectionName: string | null = null;
  const priceSectionId = d.contractType === "paid" ? d.priceSectionId : null;
  if (d.contractType === "paid") {
    if (!priceSectionId) throw new ApiError("اختر قسم سعر البيع");
    const section = await db.collection("sales_sections").doc(priceSectionId).get();
    if (!section.exists || section.data()!.channel !== "contracts") throw new ApiError("قسم السعر يجب أن يكون من التعاقدات والمدارس");
    priceSectionName = section.data()!.name;
  }
  const built = await buildTerms(db, d.terms, d.contractType, priceSectionId);
  const counterRef = db.collection("counters").doc("contracts");
  const ref = db.collection("contracts").doc();
  let contractNumber = 1;

  await db.runTransaction(async (tx) => {
    const c = await tx.get(counterRef);
    contractNumber = ((c.data()?.lastNumber as number) ?? 0) + 1;
    tx.set(counterRef, { lastNumber: contractNumber });
    tx.set(ref, {
      contractNumber,
      contractType: d.contractType,
      priceSectionId: priceSectionId ?? null,
      priceSectionName,
      name: d.name,
      clientName: d.clientName,
      clientPhone: d.clientPhone,
      startDate: d.startDate,
      endDate: d.endDate,
      status: "active",
      // القيمة المكتوبة تسود إن أُدخلت، وإلا فمجموع البنود
      totalValue: d.totalValue && d.totalValue > 0 ? r2(d.totalValue) : built.total,
      vatRate: d.vatRate,
      terms: built.terms,
      notes: d.notes,
      paid: 0,
      createdAt: Timestamp.now(),
      createdBy: d.createdBy,
    });
  });
  return { id: ref.id, contractNumber };
}

const EDITABLE = new Set([
  "name", "clientName", "clientPhone", "startDate", "endDate", "totalValue", "vatRate", "notes",
]);

export async function svcUpdateContract(
  db: Firestore,
  id: string,
  d: Record<string, unknown>,
  terms?: TermInput[]
) {
  const ref = db.collection("contracts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("العقد غير موجود", 404);

  const current = snap.data()!;
  if ((d.contractType !== undefined && d.contractType !== current.contractType) ||
      (d.priceSectionId !== undefined && d.priceSectionId !== (current.priceSectionId ?? null))) {
    throw new ApiError("نوع العقد وقسم السعر ثابتان بعد الإنشاء للحفاظ على الحسابات المسجلة");
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (EDITABLE.has(k)) patch[k] = v;

  if ((patch.endDate ?? current.endDate) < (patch.startDate ?? current.startDate)) {
    throw new ApiError("تاريخ نهاية العقد قبل بدايته");
  }
  if (terms) {
    const built = await buildTerms(db, terms, current.contractType, current.priceSectionId, current.terms);
    patch.terms = built.terms;
    // القيمة تتبع البنود ما لم تُكتب صراحةً في نفس الطلب
    if (patch.totalValue == null || patch.totalValue === 0) patch.totalValue = built.total;
  }
  if (Object.keys(patch).length === 0) throw new ApiError("لا يوجد ما يُعدَّل");
  await ref.update(patch);
}

export async function svcCancelContract(db: Firestore, id: string, reason: string) {
  const ref = db.collection("contracts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("العقد غير موجود", 404);
  if (snap.data()!.status === "cancelled") throw new ApiError("العقد ملغى أصلاً");
  await ref.update({
    status: "cancelled",
    cancelledAt: Timestamp.now(),
    cancellationReason: reason || null,
  });
}

export async function svcCompleteContract(db: Firestore, id: string) {
  const ref = db.collection("contracts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("العقد غير موجود", 404);
  if (snap.data()!.status === "cancelled") throw new ApiError("لا يمكن إتمام عقد ملغى");
  await ref.update({ status: "completed" });
}

/** يعيد العقد المنتهي إلى «ساري» من دون المساس بالدفعات أو الأيام أو التكاليف المسجلة. */
export async function svcReopenContract(db: Firestore, id: string) {
  const ref = db.collection("contracts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("العقد غير موجود", 404);

  const status = snap.data()!.status;
  if (status === "cancelled") throw new ApiError("لا يمكن إعادة فتح عقد ملغى");
  if (status !== "completed") throw new ApiError("العقد ليس منتهياً");

  await ref.update({ status: "active" });
}

/** حذف العقد يُمنع ما دام محمّلاً عليه صرف — وإلا ضاعت تكلفة مسجّلة */
export async function svcDeleteContract(db: Firestore, id: string) {
  const used = await db.collection("cost_outgoing").where("contractId", "==", id).limit(1).get();
  if (!used.empty) {
    throw new ApiError("لا يمكن حذف العقد — صُرفت عليه خامات مسجّلة. ألغِه بدل حذفه.");
  }
  /* يومٌ بلا توريد لا يترك أثراً في المنصرف، فلا يكفي الفحص أعلاه وحده */
  const days = await db.collection("contract_days").where("contractId", "==", id).limit(1).get();
  if (!days.empty) {
    throw new ApiError("لا يمكن حذف العقد — له أيام مسجّلة في الجدول اليومي. ألغِه بدل حذفه.");
  }
  const pays = await db.collection("contract_payments").where("contractId", "==", id).get();
  const batch = db.batch();
  for (const d of pays.docs) batch.delete(d.ref);
  batch.delete(db.collection("contracts").doc(id));
  await batch.commit();
}

/* ── دفعات العقد ── */

async function recalcContractPaid(db: Firestore, contractId: string) {
  const snap = await db.collection("contract_payments").where("contractId", "==", contractId).get();
  const total = snap.docs.reduce((s, d) => s + ((d.data().amount as number) ?? 0), 0);
  await db.collection("contracts").doc(contractId).update({ paid: r2(total) });
}

export async function svcAddContractPayment(
  db: Firestore,
  d: {
    contractId: string; method: string; amount: number; date: string;
    cardType: string | null; receiverName: string | null; bankName: string | null;
    senderName: string | null; hasInvoice: boolean | null;
    invoiceRegistered: boolean | null; invoiceNumber: string | null; createdBy: string;
  }
) {
  const c = await db.collection("contracts").doc(d.contractId).get();
  if (!c.exists) throw new ApiError("العقد غير موجود", 404);

  /* رقم الفاتورة لا يتكرّر: بين دفعات العقود، ولا مع فاتورة حفلة.
     فاتورة الحفلة صارت على مستند الحفلة لا على دفعاتها، فالفحص انتقل
     إليها — ولو بقي على concert_payments لتسلّل رقمٌ مكرّر بلا اعتراض. */
  if (d.invoiceNumber) {
    const clashPay = await db.collection("contract_payments")
      .where("invoiceNumber", "==", d.invoiceNumber).limit(1).get();
    if (!clashPay.empty) throw new ApiError(`رقم الفاتورة ${d.invoiceNumber} مستخدم في دفعة عقد أخرى`);
    const clashConcert = await db.collection("concerts")
      .where("invoiceNumber", "==", d.invoiceNumber).limit(1).get();
    if (!clashConcert.empty) {
      throw new ApiError(`رقم الفاتورة ${d.invoiceNumber} مستعمل في حفلة: ${clashConcert.docs[0].data().name}`);
    }
  }

  const ref = db.collection("contract_payments").doc();
  await ref.set({ ...d, createdAt: Timestamp.now() });
  await recalcContractPaid(db, d.contractId);
  return { id: ref.id };
}

export async function svcDeleteContractPayment(db: Firestore, id: string) {
  const ref = db.collection("contract_payments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الدفعة غير موجودة", 404);
  const contractId = snap.data()!.contractId as string;
  await ref.delete();
  await recalcContractPaid(db, contractId);
}
