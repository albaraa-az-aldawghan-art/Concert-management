import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { svcAddOutgoing, svcAdjustOutgoingQty, svcSetOutgoingDamage, svcDeleteOutgoing } from "@/lib/server/costs-core";
import { svcAddContractPayment, svcDeleteContractPayment } from "@/lib/server/contracts-core";
import type { ContractExpenseKind } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   الجدول اليومي للعقد — دفتر تشغيل المقصف.

   الفكرة كلها في سطر واحد: لا أحد يعدّ ما بيع، بل يُعرف طرحاً.
   يصل للجهة كمٌّ من كل صنف، يتلف منه شيء، ويُجرد الباقي آخر اليوم:

       المباع = المورَّد + رصيد أول اليوم − المتبقي − التالف

   ورصيد أول اليوم ليس رقماً يُكتب، بل «المتبقي» من آخر يوم مسجَّل
   قبله — وإلا فالرصيد الافتتاحي للبند. لهذا لا يُقبل هنا رقمٌ مشتقّ
   من العميل: الخادم يعيد حسابه كله من الثلاثة المُدخَلة.

   والتكلفة تأتي وحدها: كتابة «المورَّد» هي عملية الصرف نفسها، تخرج
   من المخزون بمتوسط الشراء المتحرك. هذا ما لم يكن في ملف الإكسل —
   كان عمود «التكلفة» فيه فارغاً في الأوراق الستّ عشرة كلها.
   ═══════════════════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

export const DEFAULT_EXPENSE_LINES: { key: string; label: string; kind: ContractExpenseKind }[] = [
  { key: "workers",  label: "العمال",        kind: "from_till" },
  { key: "admin",    label: "الإدارة",        kind: "from_till" },
  { key: "guard",    label: "الحارس",         kind: "from_till" },
  { key: "teachers", label: "المدرسين",       kind: "from_till" },
  { key: "error",    label: "مقدار الخطأ",    kind: "deduct_collected" },
];

const METHODS = ["bank_transfer", "mada", "visa", "cash"] as const;
type Method = (typeof METHODS)[number];

/** طريقة الدفع في الجدول اليومي ← طريقة الدفع في دفعات العقد.
 *  «مدى» و«فيزا» كلتاهما شبكة، وتُميَّزان بـcardType كما في بقية الموقع. */
const METHOD_TO_PAYMENT: Record<Method, { method: string; cardType: string | null; label: string }> = {
  bank_transfer: { method: "bank_transfer", cardType: null,   label: "تحويل بنكي" },
  mada:          { method: "card",          cardType: "mada", label: "مدى" },
  visa:          { method: "card",          cardType: "visa", label: "فيزا" },
  cash:          { method: "cash",          cardType: null,   label: "كاش" },
};

export interface DayLineInput {
  barcode: string;
  supplied: number;
  damaged: number;
  remaining: number;
}

interface StoredLine {
  barcode: string; itemName: string; unit: string; salePrice: number;
  supplied: number; damaged: number; remaining: number;
  openingQty: number; sold: number; revenue: number;
  outgoingId: string | null; cost: number;
}

interface ContractDoc {
  name: string;
  status: string;
  terms?: { barcode: string; itemName: string; unit: string; unitPrice: number; openingQty?: number; category?: string | null }[];
  ledger?: {
    enabled?: boolean;
    expenseLines?: { key: string; label: string; kind: ContractExpenseKind }[];
    defaultCustody?: number;
    sectionIds?: string[];
    departmentName?: string | null;
  } | null;
}

/* معرّف اليوم مشتقّ لا عشوائي: `عقد_تاريخ`.
   فائدته أبعد من منع تكرار يومين: تصير كل قراءة عنواناً معروفاً سلفاً،
   فتُجلب المستندات مباشرةً بلا استعلام. والاستعلام هنا كان سيطلب فهرساً
   مركّباً، وإنشاء الفهارس ليس بيد حساب الخدمة الذي ينشر القواعد — فكان
   الجدول سيتعطّل عند أول استعمال على الإنتاج. */
const dayId = (contractId: string, date: string) => `${contractId}_${date}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** أيام شهر كاملاً — إحدى وثلاثون قراءة معروفة العناوين، بلا فهرس */
async function daysOfMonth(db: Firestore, contractId: string, month: string) {
  const refs = [];
  for (let d = 1; d <= 31; d++) {
    refs.push(db.collection("contract_days").doc(dayId(contractId, `${month}-${String(d).padStart(2, "0")}`)));
  }
  return (await db.getAll(...refs)).filter((s) => s.exists);
}

async function loadContract(db: Firestore, contractId: string) {
  const snap = await db.collection("contracts").doc(contractId).get();
  if (!snap.exists) throw new ApiError("العقد غير موجود", 404);
  return { ref: snap.ref, data: snap.data() as ContractDoc };
}

/* ── رصيد أول اليوم ──────────────────────────────────────────
   يُقرأ من آخر يوم مسجَّل قبل هذا التاريخ لا من اليوم السابق مباشرةً:
   المقصف يُغلق في العطل، ولو بحثنا عن «أمس» حرفياً لضاع رصيد الخميس
   يوم الأحد. هذا بالضبط ما تفعله ورقة الإكسل حين تُخفي أيام العطلة. */
async function openingByBarcode(db: Firestore, contractId: string, date: string) {
  /* يمشي للوراء يوماً تقويمياً بيوم، عشرةً في كل دفعة، ويقف عند أول
     يوم موجود — فالمعتاد عشر قراءات لا مسحُ تاريخ العقد كله. */
  const CHUNK = 10, MAX_BACK = 180;
  const cursor = new Date(`${date}T00:00:00Z`);
  let prev: FirebaseFirestore.DocumentSnapshot | undefined;
  for (let done = 0; done < MAX_BACK && !prev; done += CHUNK) {
    const refs = [];
    for (let i = 0; i < CHUNK; i++) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      refs.push(db.collection("contract_days").doc(dayId(contractId, iso(cursor))));
    }
    prev = (await db.getAll(...refs)).find((s) => s.exists); // الأقرب أولاً
  }
  const map = new Map<string, number>();
  if (prev) {
    for (const l of (prev.data()!.lines ?? []) as StoredLine[]) map.set(l.barcode, l.remaining ?? 0);
  }
  return { map, hasPrev: !!prev };
}

/* ── الحفظ ───────────────────────────────────────────────────── */

export async function svcSaveContractDay(
  db: Firestore,
  d: {
    contractId: string;
    date: string;
    lines: DayLineInput[];
    collections: Partial<Record<Method, number>>;
    expenses: { key: string; amount: number }[];
    custody: number | null;
    notes: string | null;
    uid: string;
  }
) {
  const { data: contract } = await loadContract(db, d.contractId);
  if (contract.status === "cancelled") throw new ApiError("العقد ملغى — لا يُسجَّل عليه يوم");
  if (contract.status === "completed") throw new ApiError("العقد منتهٍ — لا يُسجَّل عليه يوم");

  const terms = contract.terms ?? [];
  if (terms.length === 0) throw new ApiError("أضف بنود العقد أولاً — الجدول اليومي يعمل عليها");
  const termOf = new Map(terms.map((t) => [t.barcode, t]));

  const dayRef = db.collection("contract_days").doc(dayId(d.contractId, d.date));
  const existing = await dayRef.get();
  if (existing.exists && (existing.data()!.postedPaymentIds ?? null)) {
    throw new ApiError("رُحِّل تحصيل هذا اليوم دفعةً على العقد — تراجَع عن الترحيل قبل التعديل");
  }
  const oldLines = new Map(
    ((existing.data()?.lines ?? []) as StoredLine[]).map((l) => [l.barcode, l])
  );

  const { map: opening } = await openingByBarcode(db, d.contractId, d.date);

  /* ١) يُتحقّق من كل السطور قبل لمس المخزون: لا يُصرف نصف يوم ثم يُرفض */
  const seen = new Set<string>();
  const planned: (DayLineInput & { term: NonNullable<ReturnType<typeof termOf.get>>; openingQty: number; sold: number })[] = [];
  for (const raw of d.lines) {
    const term = termOf.get(raw.barcode);
    if (!term) throw new ApiError(`الصنف ${raw.barcode} ليس من بنود هذا العقد`);
    if (seen.has(raw.barcode)) throw new ApiError(`تكرّر الصنف "${term.itemName}" في يوم واحد`);
    seen.add(raw.barcode);

    for (const [v, label] of [[raw.supplied, "المورَّد"], [raw.damaged, "التالف"], [raw.remaining, "المتبقي"]] as const) {
      if (!Number.isFinite(v) || v < 0) throw new ApiError(`${label} في "${term.itemName}" لا يقبل قيمة سالبة`);
    }

    const openingQty = opening.get(raw.barcode) ?? term.openingQty ?? 0;
    const available = r2(raw.supplied + openingQty);
    if (r2(raw.damaged + raw.remaining) > available + 1e-9) {
      throw new ApiError(
        `"${term.itemName}": التالف والمتبقي (${r2(raw.damaged + raw.remaining)}) أكثر من المتاح ` +
        `(${raw.supplied} مورَّد + ${openingQty} رصيد أول اليوم = ${available})`
      );
    }
    /* التالف يُحسم من عملية صرف اليوم — فبلا توريد لا شيء يُحسم منه.
       الفحص هنا لا بعد فتح المعاملة: كان يقع بعد حذف عملية الصرف،
       فيُرفض الطلب وقد تغيّر المخزون فعلاً. */
    if (raw.damaged > 0 && raw.supplied === 0) {
      throw new ApiError(
        `"${term.itemName}": تالف بلا كمية مورَّدة اليوم — سجّله في اليوم الذي وُرّد فيه، أو من صفحة التالف`
      );
    }

    const sold = r2(available - raw.remaining - raw.damaged);
    planned.push({ ...raw, term, openingQty, sold });
  }

  /* ٢) مزامنة المخزون: عملية صرف واحدة لكل سطر، تُحرَّك بالفرق */
  const dept = contract.ledger?.departmentName || "التعاقدات";
  const out: StoredLine[] = [];
  for (const p of planned) {
    const old = oldLines.get(p.barcode);
    let outgoingId = old?.outgoingId ?? null;

    if (outgoingId) {
      const stillThere = await db.collection("cost_outgoing").doc(outgoingId).get();
      if (!stillThere.exists) outgoingId = null; // حُذفت من صفحة المنصرف — يُعاد إنشاؤها
    }

    if (p.supplied > 0 && !outgoingId) {
      const created = await svcAddOutgoing(db, {
        itemBarcode: p.barcode,
        quantity: p.supplied,
        unitPrice: await avgPriceOf(db, p.barcode),
        departmentName: dept,
        concertId: null, concertName: null, clientName: null, manualConcertName: null,
        contractId: d.contractId, contractName: contract.name,
        channel: "contracts",
        dispenseDate: d.date,
        createdBy: d.uid,
      });
      outgoingId = created.id;
    } else if (outgoingId && p.supplied !== (old?.supplied ?? 0)) {
      if (p.supplied === 0) {
        await svcSetOutgoingDamage(db, outgoingId, { damagedQty: 0, reason: "", damageDate: d.date, createdBy: d.uid });
        await svcDeleteOutgoing(db, outgoingId);
        outgoingId = null;
      } else {
        /* التالف يُصفَّر أولاً كي لا يمنع خفضَ الكمية دونه، ثم يُعاد ضبطه */
        await svcSetOutgoingDamage(db, outgoingId, { damagedQty: 0, reason: "", damageDate: d.date, createdBy: d.uid });
        await svcAdjustOutgoingQty(db, outgoingId, p.supplied);
      }
    }

    if (outgoingId) {
      await svcSetOutgoingDamage(db, outgoingId, {
        damagedQty: p.damaged,
        reason: `تالف الجدول اليومي — ${contract.name} — ${d.date}`,
        damageDate: d.date,
        createdBy: d.uid,
      });
    }

    const costSnap = outgoingId ? await db.collection("cost_outgoing").doc(outgoingId).get() : null;
    out.push({
      barcode: p.barcode,
      itemName: p.term.itemName,
      unit: p.term.unit,
      salePrice: p.term.unitPrice ?? 0,
      supplied: p.supplied,
      damaged: p.damaged,
      remaining: p.remaining,
      openingQty: p.openingQty,
      sold: p.sold,
      revenue: r2(p.sold * (p.term.unitPrice ?? 0)),
      outgoingId,
      cost: r2((costSnap?.data()?.totalCost as number) ?? 0),
    });
  }

  /* سطر حُذف من اليوم: يُفرَج عمّا صُرف فيه كاملاً */
  for (const [barcode, old] of oldLines) {
    if (seen.has(barcode) || !old.outgoingId) continue;
    await svcSetOutgoingDamage(db, old.outgoingId, { damagedQty: 0, reason: "", damageDate: d.date, createdBy: d.uid });
    await svcDeleteOutgoing(db, old.outgoingId);
  }

  /* ٣) التحصيل والمصروفات والمطابقة */
  const config = contract.ledger?.expenseLines?.length ? contract.ledger.expenseLines : DEFAULT_EXPENSE_LINES;
  const amountByKey = new Map(d.expenses.map((e) => [e.key, e.amount]));
  for (const e of d.expenses) {
    if (!config.some((c) => c.key === e.key)) throw new ApiError(`بند مصروف غير معرَّف في هذا العقد: ${e.key}`);
    if (!Number.isFinite(e.amount) || e.amount < 0) throw new ApiError("مبلغ المصروف لا يقبل قيمة سالبة");
  }
  const expenses = config.map((c) => ({ ...c, amount: r2(amountByKey.get(c.key) ?? 0) }));

  const collections = Object.fromEntries(
    METHODS.map((m) => {
      const v = d.collections[m] ?? 0;
      if (!Number.isFinite(v) || v < 0) throw new ApiError("مبلغ التحصيل لا يقبل قيمة سالبة");
      return [m, r2(v)];
    })
  ) as Record<Method, number>;

  const totals = computeTotals(out, collections, expenses);

  const payload = {
    contractId: d.contractId,
    date: d.date,
    lines: out,
    collections,
    expenses,
    custody: r2(d.custody ?? contract.ledger?.defaultCustody ?? 0),
    notes: d.notes,
    totals,
    postedPaymentIds: null,
    updatedAt: Timestamp.now(),
    updatedBy: d.uid,
    ...(existing.exists ? {} : { createdAt: Timestamp.now(), createdBy: d.uid }),
  };
  await dayRef.set(payload, { merge: true });
  return { id: dayRef.id, totals };
}

/** متوسط الشراء المتحرك لصنف — سعر خروج الوحدة من المخزون */
async function avgPriceOf(db: Firestore, barcode: string) {
  const snap = await db.collection("cost_items").doc(barcode).get();
  if (!snap.exists) throw new ApiError("الصنف غير مسجّل في التكاليف");
  const i = snap.data() as { totalIn?: number; totalOut?: number; totalInValue?: number };
  const balance = (i.totalIn ?? 0) - (i.totalOut ?? 0);
  return balance > 0 ? r2((i.totalInValue ?? 0) / balance) : 0;
}

/* ── المطابقة اليومية ─────────────────────────────────────────
   معادلة الإكسل كانت «الفرق = الإجمالي − الصافي» والصافي يحتوي
   الإجمالي نفسه، فكانت النتيجة سالبَ المصروفات دائماً مهما كانت
   الأرقام — لا تكشف نقصاً في الصندوق ولا زيادة.

   الصحيح أن يُقارن المال بالبيع: ما دخل الصندوق من البيع (المحصَّل
   ناقص ما دخله من غير بيع) يجب أن يساوي المتوقَّع (مبيعات اليوم ناقص
   ما دُفع من الصندوق نقداً).                                        */
function computeTotals(
  lines: StoredLine[],
  collections: Record<Method, number>,
  expenses: { kind: ContractExpenseKind; amount: number }[]
) {
  const sales = r2(lines.reduce((s, l) => s + l.revenue, 0));
  const cost = r2(lines.reduce((s, l) => s + l.cost, 0));
  const collected = r2(METHODS.reduce((s, m) => s + (collections[m] ?? 0), 0));
  const deducted = r2(expenses.filter((e) => e.kind === "deduct_collected").reduce((s, e) => s + e.amount, 0));
  const paidFromTill = r2(expenses.filter((e) => e.kind === "from_till").reduce((s, e) => s + e.amount, 0));
  const expected = r2(sales - paidFromTill);
  return {
    sales, cost, collected, deducted, paidFromTill, expected,
    variance: r2(collected - deducted - expected),
    expenses: r2(deducted + paidFromTill),
  };
}

/* ── الحذف ───────────────────────────────────────────────────── */

export async function svcDeleteContractDay(db: Firestore, contractId: string, date: string, uid: string) {
  const ref = db.collection("contract_days").doc(dayId(contractId, date));
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("لا يوجد يوم مسجَّل بهذا التاريخ", 404);
  if (snap.data()!.postedPaymentIds) {
    throw new ApiError("رُحِّل تحصيل هذا اليوم — تراجَع عن الترحيل قبل الحذف");
  }
  /* كل ما صُرف في هذا اليوم يعود للمخزون قبل محو السجل */
  for (const l of (snap.data()!.lines ?? []) as StoredLine[]) {
    if (!l.outgoingId) continue;
    await svcSetOutgoingDamage(db, l.outgoingId, { damagedQty: 0, reason: "", damageDate: date, createdBy: uid })
      .catch(() => {});
    await svcDeleteOutgoing(db, l.outgoingId).catch(() => {});
  }
  await ref.delete();
}

/* ── ملخص الشهر ──────────────────────────────────────────────
   الأعمدة الثلاثة التي في ذيل ورقة الإكسل، وما لم يكن فيها: التكلفة
   والربح. «الجرد المتبقي» آخر متبقٍّ مسجَّل لا مجموع، فالمخزون رصيد
   لا حركة — جمعه يعطي رقماً بلا معنى.                              */
export async function svcContractMonth(db: Firestore, contractId: string, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError("الشهر بصيغة yyyy-mm");
  const { data: contract } = await loadContract(db, contractId);
  const docs = await daysOfMonth(db, contractId, month);

  const days = docs
    .map((x) => x.data() as { date: string; lines: StoredLine[]; totals: Record<string, number>; collections: Record<string, number>; expenses: { key: string; label: string; kind: string; amount: number }[]; custody: number; postedPaymentIds: string[] | null })
    .sort((a, b) => a.date.localeCompare(b.date));

  const byItem = new Map<string, { barcode: string; itemName: string; unit: string; salePrice: number; category: string | null; soldQty: number; revenue: number; cost: number; damaged: number; supplied: number; closing: number }>();
  for (const t of contract.terms ?? []) {
    byItem.set(t.barcode, {
      barcode: t.barcode, itemName: t.itemName, unit: t.unit, salePrice: t.unitPrice ?? 0,
      category: t.category ?? null,
      soldQty: 0, revenue: 0, cost: 0, damaged: 0, supplied: 0, closing: t.openingQty ?? 0,
    });
  }
  for (const day of days) {
    for (const l of day.lines ?? []) {
      const row = byItem.get(l.barcode);
      if (!row) continue;
      row.soldQty = r2(row.soldQty + l.sold);
      row.revenue = r2(row.revenue + l.revenue);
      row.cost = r2(row.cost + l.cost);
      row.damaged = r2(row.damaged + l.damaged);
      row.supplied = r2(row.supplied + l.supplied);
      row.closing = l.remaining; // آخر يوم يكتب فيه هذا الصنف يسود
    }
  }

  const items = [...byItem.values()];
  const sum = (f: (t: Record<string, number>) => number) => r2(days.reduce((s, d) => s + (f(d.totals ?? {}) || 0), 0));
  const expensesByLine = new Map<string, { label: string; kind: string; amount: number }>();
  for (const day of days) {
    for (const e of day.expenses ?? []) {
      const cur = expensesByLine.get(e.key) ?? { label: e.label, kind: e.kind, amount: 0 };
      cur.amount = r2(cur.amount + (e.amount ?? 0));
      expensesByLine.set(e.key, cur);
    }
  }

  const sales = sum((t) => t.sales);
  const cost = sum((t) => t.cost);
  const expenses = sum((t) => t.expenses);
  return {
    month,
    contractName: contract.name,
    days,
    items,
    expenseLines: [...expensesByLine].map(([key, v]) => ({ key, ...v })),
    collections: Object.fromEntries(METHODS.map((m) => [m, r2(days.reduce((s, d) => s + (d.collections?.[m] ?? 0), 0))])),
    totals: {
      sales,                                   // FB — الإجمالي
      closingStock: r2(items.reduce((s, i) => s + i.closing, 0)), // FC — الجرد المتبقي
      soldQty: r2(items.reduce((s, i) => s + i.soldQty, 0)),      // FD — الاستهلاك
      cost, expenses,
      profit: r2(sales - cost - expenses),
      collected: sum((t) => t.collected),
      variance: sum((t) => t.variance),
    },
    posted: days.some((d) => d.postedPaymentIds?.length),
  };
}

/* ── ترحيل تحصيل الشهر دفعةً ───────────────────────────────── */

export async function svcPostMonthCollections(db: Firestore, contractId: string, month: string, uid: string) {
  const { data: contract } = await loadContract(db, contractId);
  if (contract.status === "cancelled") throw new ApiError("العقد ملغى — لا يُرحَّل عليه تحصيل");

  const docs = await daysOfMonth(db, contractId, month);
  if (docs.length === 0) throw new ApiError("لا أيام مسجَّلة في هذا الشهر");
  if (docs.some((x) => x.data()!.postedPaymentIds?.length)) {
    throw new ApiError("رُحِّل هذا الشهر من قبل — تراجَع عن الترحيل أولاً");
  }

  const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<Method, number>;
  for (const doc of docs) {
    const c = (doc.data()!.collections ?? {}) as Record<string, number>;
    for (const m of METHODS) byMethod[m] = r2(byMethod[m] + (c[m] ?? 0));
  }
  const total = r2(METHODS.reduce((s, m) => s + byMethod[m], 0));
  if (total <= 0) throw new ApiError("لا تحصيل في هذا الشهر");

  /* دفعة لكل طريقة: توحيدها في واحدة يمحو التفصيل الذي جُمع يوماً بيوم */
  const ids: string[] = [];
  const lastDay = docs.map((x) => x.data()!.date as string).sort().at(-1)!;
  for (const m of METHODS) {
    if (byMethod[m] <= 0) continue;
    const map = METHOD_TO_PAYMENT[m];
    const { id } = await svcAddContractPayment(db, {
      contractId,
      method: map.method,
      amount: byMethod[m],
      date: lastDay,
      cardType: map.cardType,
      receiverName: null, bankName: null, senderName: null,
      hasInvoice: null, invoiceRegistered: null, invoiceNumber: null,
      createdBy: uid,
    });
    ids.push(id);
  }

  const batch = db.batch();
  for (const doc of docs) batch.update(doc.ref, { postedPaymentIds: ids });
  await batch.commit();
  return { paymentIds: ids, total, byMethod };
}

export async function svcUnpostMonthCollections(db: Firestore, contractId: string, month: string) {
  const docs = await daysOfMonth(db, contractId, month);
  const ids = new Set<string>();
  for (const doc of docs) for (const id of (doc.data()!.postedPaymentIds ?? []) as string[]) ids.add(id);
  if (ids.size === 0) throw new ApiError("لم يُرحَّل هذا الشهر");

  for (const id of ids) await svcDeleteContractPayment(db, id).catch(() => {});
  const batch = db.batch();
  for (const doc of docs) batch.update(doc.ref, { postedPaymentIds: null });
  await batch.commit();
  return { removed: ids.size };
}

/* ── إعداد الجدول ────────────────────────────────────────────── */

export async function svcSetLedgerConfig(
  db: Firestore,
  contractId: string,
  d: {
    enabled: boolean;
    expenseLines: { key: string; label: string; kind: ContractExpenseKind }[];
    defaultCustody: number;
    sectionIds: string[];
    departmentName: string | null;
  }
) {
  const { ref } = await loadContract(db, contractId);
  const keys = new Set<string>();
  for (const l of d.expenseLines) {
    if (!l.key || !l.label) throw new ApiError("بند المصروف يحتاج مفتاحاً واسماً");
    if (keys.has(l.key)) throw new ApiError(`تكرّر بند المصروف: ${l.label}`);
    if (l.kind !== "from_till" && l.kind !== "deduct_collected") {
      throw new ApiError(`وسم غير معروف لبند "${l.label}"`);
    }
    keys.add(l.key);
  }
  for (const id of d.sectionIds) {
    const s = await db.collection("sales_sections").doc(id).get();
    if (!s.exists) throw new ApiError("أحد الأقسام المختارة غير موجود");
    if (s.data()!.channel !== "contracts") throw new ApiError("القسم المختار ليس من قناة التعاقدات");
  }
  await ref.update({
    ledger: {
      enabled: d.enabled,
      expenseLines: d.expenseLines.length ? d.expenseLines : DEFAULT_EXPENSE_LINES,
      defaultCustody: r2(d.defaultCustody ?? 0),
      sectionIds: d.sectionIds,
      departmentName: d.departmentName,
    },
  });
}

/** أيام العقد تمنع حذفه: خلفها حركة مخزون مسجَّلة */
export async function contractHasLedgerDays(db: Firestore, contractId: string) {
  const s = await db.collection("contract_days").where("contractId", "==", contractId).limit(1).get();
  return !s.empty;
}
