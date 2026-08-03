import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CostItem, CostIncoming, CostOutgoing, CostSettings, CostDepartment, CostProduction, CostDamage, RecipeLine } from "@/types";

/* ── إعدادات التكاليف (الوحدات والأقسام) ────────────────────── */

const DEFAULT_UNITS = [
  "باكت", "تنك", "جالون", "جركل", "جم", "زجاجة", "حبة", "سافندش",
  "سطل", "شدة", "شوال", "صحن", "طبق", "علبة", "كجم", "كرتون", "كيس", "لتر",
];

const DEFAULT_DEPARTMENTS: CostDepartment[] = [
  { name: "قسم البروستد", concertLinked: false },
  { name: "قسم المشويات", concertLinked: false },
  { name: "قسم المعجنات", concertLinked: false },
  { name: "قسم الحفلات", concertLinked: true },
];

export async function getCostSettings(): Promise<CostSettings> {
  const ref = doc(db, "cost_settings", "config");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const seed: CostSettings = { units: DEFAULT_UNITS, departments: DEFAULT_DEPARTMENTS };
    // من ليس لديه صلاحية manage_items لا يستطيع زرع المستند — يكتفي بالقيم
    // الافتراضية في الذاكرة حتى يفتح أحد المدراء الصفحة فيُحفظ المستند فعلياً.
    await setDoc(ref, seed).catch(() => {});
    return seed;
  }
  const data = snap.data() as Partial<CostSettings>;
  return {
    units: data.units ?? DEFAULT_UNITS,
    departments: data.departments ?? DEFAULT_DEPARTMENTS,
  };
}

export async function updateCostSettings(data: CostSettings): Promise<void> {
  await setDoc(doc(db, "cost_settings", "config"), data);
}

/* ── الباركود الداخلي (عدّاد تسلسلي منفصل عن الحفلات) ───────── */

async function generateCostBarcode(): Promise<string> {
  const counterRef = doc(db, "counters", "cost_items");
  let barcode = "";
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() ? (snap.data().lastNumber ?? 0) + 1 : 1;
    tx.set(counterRef, { lastNumber: next });
    barcode = "FRJ" + String(next).padStart(6, "0");
  });
  return barcode;
}

/* ── أصناف التكاليف ───────────────────────────────────────────
   الباركود نفسه هو معرّف المستند: لا حاجة لفحص تكرار منفصل،
   والبحث عند مسح الباركود = قراءة مباشرة بالمعرّف. */

export async function getCostItems(): Promise<CostItem[]> {
  const snap = await getDocs(collection(db, "cost_items"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostItem))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export async function getCostItemByBarcode(barcode: string): Promise<CostItem | null> {
  const snap = await getDoc(doc(db, "cost_items", barcode.trim()));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CostItem;
}

// توليد باركود داخلي وتسجيل الصنف به في نفس المعاملة (تجنّباً لعدّاد يتيم لو فشلت الخطوة الثانية)
export async function createCostItemGenerated(data: {
  name: string;
  unit: string;
  productionDate?: string | null;
  expiryDate?: string | null;
  createdBy: string;
}): Promise<CostItem> {
  const counterRef = doc(db, "counters", "cost_items");
  let barcode = "";
  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = counterSnap.exists() ? (counterSnap.data().lastNumber ?? 0) + 1 : 1;
    barcode = "FRJ" + String(next).padStart(6, "0");
    const itemRef = doc(db, "cost_items", barcode);
    const existing = await tx.get(itemRef);
    if (existing.exists()) throw new Error("تعارض في توليد الباركود، حاول مرة أخرى");
    tx.set(counterRef, { lastNumber: next });
    tx.set(itemRef, {
      name: data.name,
      unit: data.unit,
      barcodeSource: "generated",
      totalIn: 0,
      totalOut: 0,
      totalInValue: 0,
      productionDate: data.productionDate || null,
      expiryDate: data.expiryDate || null,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
  });
  const snap = await getDoc(doc(db, "cost_items", barcode));
  return { id: barcode, ...(snap.data() as Omit<CostItem, "id">) };
}

// تسجيل صنف له باركود جاهز من المورد
export async function createCostItemFromSupplierBarcode(data: {
  name: string;
  unit: string;
  barcode: string;
  productionDate?: string | null;
  expiryDate?: string | null;
  createdBy: string;
}): Promise<CostItem> {
  const barcode = data.barcode.trim();
  const ref = doc(db, "cost_items", barcode);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) throw new Error("هذا الباركود مسجّل مسبقاً لصنف آخر");
    tx.set(ref, {
      name: data.name,
      unit: data.unit,
      barcodeSource: "supplier",
      totalIn: 0,
      totalOut: 0,
      totalInValue: 0,
      productionDate: data.productionDate || null,
      expiryDate: data.expiryDate || null,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
  });
  const snap = await getDoc(ref);
  return { id: barcode, ...(snap.data() as Omit<CostItem, "id">) };
}

// استيراد عدة أصناف دفعة واحدة بوحدة مشتركة (تُعدَّل لاحقاً لكل صنف عند الحاجة)
export async function bulkCreateCostItems(
  names: string[],
  unit: string,
  createdBy: string
): Promise<void> {
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    await createCostItemGenerated({ name: trimmed, unit, createdBy });
  }
}

export async function updateCostItem(
  barcode: string,
  data: Partial<Pick<CostItem, "name" | "unit" | "productionDate" | "expiryDate">>
): Promise<void> {
  // الوحدة تُقفل بعد أول وارد: تغييرها لاحقاً يجعل كل وصفة تشير لهذا
  // الصنف خاطئة بصمت (كجم → شوال = خمسون ضعفاً) ويفسد فحص الرصيد.
  if (data.unit !== undefined) {
    const snap = await getDoc(doc(db, "cost_items", barcode));
    const item = snap.data() as CostItem | undefined;
    if (item && (item.totalIn ?? 0) > 0 && item.unit !== data.unit) {
      throw new Error(
        `لا يمكن تغيير وحدة "${item.name}" بعد تسجيل وارد عليه — الوصفات والأرصدة محسوبة بالوحدة الحالية (${item.unit})`
      );
    }
  }
  await updateDoc(doc(db, "cost_items", barcode), data as Record<string, unknown>);
}

/** المراجع التي تمنع حذف صنف — تُعدّ قبل الحذف لا بعده */
export interface CostItemRefs {
  incoming: number;
  outgoing: number;
  production: number;
  damage: number;
  recipes: string[]; // «القسم / الصنف»
  total: number;
}

export async function getCostItemRefs(barcode: string): Promise<CostItemRefs> {
  const [inc, out, dmg, prod, food] = await Promise.all([
    getDocs(query(collection(db, "cost_incoming"), where("itemBarcode", "==", barcode))),
    getDocs(query(collection(db, "cost_outgoing"), where("itemBarcode", "==", barcode))),
    getDocs(query(collection(db, "cost_damage"), where("itemBarcode", "==", barcode))).catch(() => null),
    getDocs(collection(db, "cost_production")).catch(() => null),
    getDocs(collection(db, "food_categories")).catch(() => null),
  ]);

  // الإنتاج: الصنف قد يكون مُخرَجاً أو أحد المدخلات، والمدخلات مصفوفة
  // كائنات لا يمكن الاستعلام داخلها — فتُفحص في الذاكرة
  let production = 0;
  for (const d of prod?.docs ?? []) {
    const p = d.data() as Omit<CostProduction, "id">;
    if (p.outputBarcode === barcode || (p.inputs ?? []).some((i) => i.barcode === barcode)) production++;
  }

  const recipes: string[] = [];
  for (const d of food?.docs ?? []) {
    const c = d.data() as { name: string; optionDefs?: { name: string; recipe?: RecipeLine[]; costItemBarcode?: string | null }[] };
    for (const def of c.optionDefs ?? []) {
      const inRecipe = (def.recipe ?? []).some((l) => l.barcode === barcode);
      if (inRecipe || def.costItemBarcode === barcode) recipes.push(`${c.name} / ${def.name}`);
    }
  }

  const incoming = inc.size, outgoing = out.size, damage = dmg?.size ?? 0;
  return {
    incoming, outgoing, production, damage, recipes,
    total: incoming + outgoing + production + damage + recipes.length,
  };
}

/** حذف صنف له مراجع يترك وصفاتٍ تشير إلى باركود غير موجود، فتُحسب
 *  تكلفة الطبق صفراً ويظهر «متاح 0» بلا أي رسالة. لذلك يُمنع الحذف
 *  ما دام له أثر، ويُذكر سببه بالتفصيل. */
export async function deleteCostItem(barcode: string): Promise<void> {
  const refs = await getCostItemRefs(barcode);
  if (refs.total > 0) {
    const parts: string[] = [];
    if (refs.incoming) parts.push(`${refs.incoming} عملية وارد`);
    if (refs.outgoing) parts.push(`${refs.outgoing} عملية منصرف`);
    if (refs.production) parts.push(`${refs.production} عملية إنتاج`);
    if (refs.damage) parts.push(`${refs.damage} قيد تالف`);
    if (refs.recipes.length) parts.push(`وصفات: ${refs.recipes.slice(0, 3).join("، ")}${refs.recipes.length > 3 ? " وغيرها" : ""}`);
    throw new Error(`لا يمكن حذف هذا الصنف — مرتبط بـ ${parts.join(" · ")}. احذف ما يشير إليه أولاً أو أبقِه كما هو.`);
  }
  await deleteDoc(doc(db, "cost_items", barcode));
}

/* ── الوارد ────────────────────────────────────────────────── */

export async function getCostIncoming(): Promise<CostIncoming[]> {
  const snap = await getDocs(collection(db, "cost_incoming"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostIncoming))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function addCostIncoming(data: {
  itemBarcode: string;
  supplierName: string;
  quantity: number;
  priceBeforeVat: number;
  invoiceDate: string;
  createdBy: string;
}): Promise<void> {
  const itemRef = doc(db, "cost_items", data.itemBarcode);
  const incomingRef = doc(collection(db, "cost_incoming"));
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error("الصنف غير مسجّل — سجّله أولاً من صفحة أصناف التكاليف");
    const item = itemSnap.data() as Omit<CostItem, "id">;
    const totalBeforeVat = data.quantity * data.priceBeforeVat;
    tx.set(incomingRef, {
      itemBarcode: data.itemBarcode,
      itemName: item.name,
      supplierName: data.supplierName,
      unit: item.unit,
      quantity: data.quantity,
      priceBeforeVat: data.priceBeforeVat,
      totalBeforeVat,
      invoiceDate: data.invoiceDate,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
    tx.update(itemRef, {
      totalIn: (item.totalIn ?? 0) + data.quantity,
      totalInValue: (item.totalInValue ?? 0) + totalBeforeVat,
    });
  });
}

export async function deleteCostIncoming(entry: CostIncoming): Promise<void> {
  const itemRef = doc(db, "cost_items", entry.itemBarcode);
  const entryRef = doc(db, "cost_incoming", entry.id);
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (itemSnap.exists()) {
      const item = itemSnap.data() as Omit<CostItem, "id">;
      // حذف وارد استُهلك أصلاً كان يقصّ الرصيد عند الصفر بصمت ويشوّه
      // المتوسط — فيُرفض ويُشرح السبب بدل أن يمرّ
      const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
      if (entry.quantity > balance) {
        throw new Error(
          `لا يمكن حذف هذا الوارد — المتبقي من "${item.name}" ${balance} ${item.unit} فقط والحذف يسحب ${entry.quantity}. احذف عمليات الصرف أو التالف المرتبطة أولاً.`
        );
      }
      tx.update(itemRef, {
        totalIn: (item.totalIn ?? 0) - entry.quantity,
        totalInValue: Math.max(0, (item.totalInValue ?? 0) - entry.totalBeforeVat),
      });
    }
    tx.delete(entryRef);
  });
}

/* ── الإنتاج (الخلطات) ──────────────────────────────────────
   تستهلك مواد خام وتُنتج صنفاً جاهزاً له باركوده الخاص. تكلفة
   المُنتَج = مجموع تكاليف مدخلاته، فيصير متوسط سعره صادقاً تلقائياً
   ومنه تُحسب تكلفة أصناف الأكل المرتبطة به. */

export async function getCostProductions(): Promise<CostProduction[]> {
  const snap = await getDocs(collection(db, "cost_production"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostProduction))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function addCostProduction(data: {
  outputBarcode: string;
  outputQty: number;
  inputs: { barcode: string; qty: number }[];
  productionDate: string;
  expiryDate?: string | null;
  notes: string | null;
  createdBy: string;
}): Promise<void> {
  if (data.outputQty <= 0) throw new Error("أدخل كمية إنتاج صحيحة");
  if (data.inputs.length === 0) throw new Error("أضف مادة خام واحدة على الأقل");
  if (data.inputs.some((i) => i.barcode === data.outputBarcode)) {
    throw new Error("لا يمكن أن يكون الصنف المُنتَج أحد مدخلاته");
  }

  const outputRef = doc(db, "cost_items", data.outputBarcode);
  const inputRefs = data.inputs.map((i) => doc(db, "cost_items", i.barcode));
  const productionRef = doc(collection(db, "cost_production"));

  await runTransaction(db, async (tx) => {
    // كل القراءات قبل أي كتابة — شرط معاملات Firestore
    const outputSnap = await tx.get(outputRef);
    if (!outputSnap.exists()) throw new Error("الصنف المُنتَج غير مسجّل");
    const inputSnaps = await Promise.all(inputRefs.map((r) => tx.get(r)));

    const output = outputSnap.data() as Omit<CostItem, "id">;
    const lines: CostProduction["inputs"] = [];
    let totalCost = 0;

    for (let i = 0; i < data.inputs.length; i++) {
      const snap = inputSnaps[i];
      const req = data.inputs[i];
      if (!snap.exists()) throw new Error("إحدى المواد الخام غير مسجّلة");
      const item = snap.data() as Omit<CostItem, "id">;
      const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
      if (req.qty > balance) {
        throw new Error(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
      }
      // متوسط سعر الشراء وقت الإنتاج هو تكلفة المدخل
      const unitCost = balance > 0 ? (item.totalInValue ?? 0) / balance : 0;
      const lineCost = Math.round(unitCost * req.qty * 100) / 100;
      totalCost += lineCost;
      lines.push({
        barcode: req.barcode,
        itemName: item.name,
        unit: item.unit,
        qty: req.qty,
        unitCost: Math.round(unitCost * 100) / 100,
        totalCost: lineCost,
      });
    }

    totalCost = Math.round(totalCost * 100) / 100;
    const unitCost = Math.round((totalCost / data.outputQty) * 100) / 100;

    tx.set(productionRef, {
      outputBarcode: data.outputBarcode,
      outputName: output.name,
      outputUnit: output.unit,
      outputQty: data.outputQty,
      inputs: lines,
      totalCost,
      unitCost,
      productionDate: data.productionDate,
      expiryDate: data.expiryDate || null,
      notes: data.notes,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });

    // المدخلات تُستهلك، والمُنتَج يدخل المخزون بتكلفته المحسوبة
    for (let i = 0; i < inputRefs.length; i++) {
      const item = inputSnaps[i].data() as Omit<CostItem, "id">;
      tx.update(inputRefs[i], {
        totalOut: (item.totalOut ?? 0) + data.inputs[i].qty,
        totalInValue: Math.max(0, (item.totalInValue ?? 0) - lines[i].totalCost),
      });
    }
    // تاريخا الدفعة يُنسخان على الصنف نفسه، فتُطبع إعادة الملصق من صفحة
    // الأصناف بتاريخ آخر دفعة أُنتجت لا بتاريخ التسجيل القديم
    tx.update(outputRef, {
      totalIn: (output.totalIn ?? 0) + data.outputQty,
      totalInValue: (output.totalInValue ?? 0) + totalCost,
      productionDate: data.productionDate,
      expiryDate: data.expiryDate || null,
    });
  });
}

export async function deleteCostProduction(entry: CostProduction): Promise<void> {
  const outputRef = doc(db, "cost_items", entry.outputBarcode);
  const inputRefs = entry.inputs.map((i) => doc(db, "cost_items", i.barcode));
  await runTransaction(db, async (tx) => {
    const outputSnap = await tx.get(outputRef);
    const inputSnaps = await Promise.all(inputRefs.map((r) => tx.get(r)));

    if (outputSnap.exists()) {
      const o = outputSnap.data() as Omit<CostItem, "id">;
      tx.update(outputRef, {
        totalIn: Math.max(0, (o.totalIn ?? 0) - entry.outputQty),
        totalInValue: Math.max(0, (o.totalInValue ?? 0) - entry.totalCost),
      });
    }
    for (let i = 0; i < inputRefs.length; i++) {
      if (!inputSnaps[i].exists()) continue;
      const item = inputSnaps[i].data() as Omit<CostItem, "id">;
      tx.update(inputRefs[i], {
        totalOut: Math.max(0, (item.totalOut ?? 0) - entry.inputs[i].qty),
        totalInValue: Math.round(((item.totalInValue ?? 0) + entry.inputs[i].totalCost) * 100) / 100,
      });
    }
    tx.delete(doc(db, "cost_production", entry.id));
  });
}

/** حفظ الخلطة القياسية على الصنف المُنتَج — تُعبّئ نموذج الإنتاج تلقائياً */
export async function updateProductionRecipe(barcode: string, recipe: RecipeLine[]): Promise<void> {
  await updateDoc(doc(db, "cost_items", barcode), {
    productionRecipe: recipe.length ? recipe : null,
  });
}

/* ── المنصرف ───────────────────────────────────────────────── */

export async function getCostOutgoing(): Promise<CostOutgoing[]> {
  const snap = await getDocs(collection(db, "cost_outgoing"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostOutgoing))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function getCostOutgoingByConcert(concertId: string): Promise<CostOutgoing[]> {
  const snap = await getDocs(
    query(collection(db, "cost_outgoing"), where("concertId", "==", concertId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostOutgoing))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

/** منصرف مجموعة حفلات بعينها — بنفس تقسيم الحزم */
export async function getCostOutgoingForConcerts(ids: string[]): Promise<CostOutgoing[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((ch) => getDocs(query(collection(db, "cost_outgoing"), where("concertId", "in", ch))))
  );
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as CostOutgoing)));
}

export async function addCostOutgoing(data: {
  itemBarcode: string;
  quantity: number;
  unitPrice: number;
  departmentName: string;
  concertId: string | null;
  concertName: string | null;
  clientName: string | null;
  manualConcertName: string | null;
  dispenseDate: string;
  createdBy: string;
}): Promise<void> {
  const itemRef = doc(db, "cost_items", data.itemBarcode);
  const outgoingRef = doc(collection(db, "cost_outgoing"));
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error("الصنف غير مسجّل — سجّله أولاً من صفحة أصناف التكاليف");
    const item = itemSnap.data() as Omit<CostItem, "id">;
    const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
    if (data.quantity > balance) {
      throw new Error(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
    }
    const totalCost = data.quantity * data.unitPrice;
    // قيمة المخزون الخارجة تُحسب بمتوسط ما في اليد، وتُحفظ على العملية
    // كي يُعكس الحذف والإرجاع بنفس القيمة لا بتقدير لاحق
    const avg = balance > 0 ? (item.totalInValue ?? 0) / balance : 0;
    const stockValue = Math.round(avg * data.quantity * 100) / 100;
    tx.set(outgoingRef, {
      stockValue,
      itemBarcode: data.itemBarcode,
      itemName: item.name,
      unit: item.unit,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalCost,
      departmentName: data.departmentName,
      concertId: data.concertId,
      concertName: data.concertName,
      clientName: data.clientName,
      manualConcertName: data.manualConcertName,
      dispenseDate: data.dispenseDate,
      returnedQty: 0,
      damagedQty: 0,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
    tx.update(itemRef, {
      totalOut: (item.totalOut ?? 0) + data.quantity,
      totalInValue: Math.max(0, (item.totalInValue ?? 0) - stockValue),
    });
  });
}

export async function deleteCostOutgoing(entry: CostOutgoing): Promise<void> {
  const itemRef = doc(db, "cost_items", entry.itemBarcode);
  const entryRef = doc(db, "cost_outgoing", entry.id);
  // ما رجع للمخزون سبق أن خُصم من totalOut، فإرجاعه هنا مرة أخرى يضخّم
  // الرصيد. ما تلف بقي خارج المخزون فحذف العملية لا يعيده.
  const stillOut = entry.quantity - (entry.returnedQty ?? 0);
  const valuePerUnit = entry.quantity > 0 ? (entry.stockValue ?? 0) / entry.quantity : 0;
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (itemSnap.exists()) {
      const item = itemSnap.data() as Omit<CostItem, "id">;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - stillOut),
        totalInValue: Math.round(((item.totalInValue ?? 0) + valuePerUnit * stillOut) * 100) / 100,
      });
    }
    tx.delete(entryRef);
  });
}

/* ── التالف والمرتجع ──────────────────────────────────────────
   تسوية عملية صرف: جزء يرجع للمخزون صالحاً، وجزء تلف فلا يرجع.
   في الحالتين لا تُحمَّل الحفلة إلا ما استُهلك فعلاً، والتالف يُقيَّد
   خسارة عامة لا تكلفة حفلة — وإلا ظهر التلف وكأنه استهلاك. */

export async function settleCostOutgoing(
  entry: CostOutgoing,
  data: { returnedQty: number; damagedQty: number; reason: string; damageDate: string; createdBy: string }
): Promise<void> {
  const returned = Math.round((data.returnedQty || 0) * 1000) / 1000;
  const damaged = Math.round((data.damagedQty || 0) * 1000) / 1000;
  if (returned < 0 || damaged < 0) throw new Error("الكميات لا تقبل قيماً سالبة");
  if (returned + damaged <= 0) throw new Error("أدخل كمية مرتجعة أو تالفة");

  const alreadyReturned = entry.returnedQty ?? 0;
  const alreadyDamaged = entry.damagedQty ?? 0;
  const remaining = entry.quantity - alreadyReturned - alreadyDamaged;
  if (returned + damaged > remaining + 1e-9) {
    throw new Error(`المتبقي من هذه العملية ${remaining} ${entry.unit} فقط`);
  }

  const itemRef = doc(db, "cost_items", entry.itemBarcode);
  const entryRef = doc(db, "cost_outgoing", entry.id);
  const damageRef = doc(collection(db, "cost_damage"));

  const newReturned = alreadyReturned + returned;
  const newDamaged = alreadyDamaged + damaged;
  const consumed = entry.quantity - newReturned - newDamaged;

  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);

    tx.update(entryRef, {
      returnedQty: newReturned,
      damagedQty: newDamaged,
      // التكلفة المحمَّلة على الحفلة تنكمش لما استُهلك فقط
      totalCost: Math.round(consumed * entry.unitPrice * 100) / 100,
    });

    // المرتجع فقط يعود للرصيد — التالف خرج ولن يعود
    if (returned > 0 && itemSnap.exists()) {
      const item = itemSnap.data() as Omit<CostItem, "id">;
      const valuePerUnit = entry.quantity > 0 ? (entry.stockValue ?? 0) / entry.quantity : 0;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - returned),
        totalInValue: Math.round(((item.totalInValue ?? 0) + valuePerUnit * returned) * 100) / 100,
      });
    }

    if (damaged > 0) {
      tx.set(damageRef, {
        itemBarcode: entry.itemBarcode,
        itemName: entry.itemName,
        unit: entry.unit,
        quantity: damaged,
        unitCost: entry.unitPrice,
        totalCost: Math.round(damaged * entry.unitPrice * 100) / 100,
        reason: data.reason,
        source: "outgoing",
        outgoingId: entry.id,
        concertId: entry.concertId ?? null,
        concertName: entry.concertName ?? null,
        clientName: entry.clientName ?? null,
        damageDate: data.damageDate,
        createdAt: Timestamp.now(),
        createdBy: data.createdBy,
      });
    }
  });
}

export async function getCostDamages(): Promise<CostDamage[]> {
  const snap = await getDocs(collection(db, "cost_damage"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as CostDamage))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

/** تلف داخل المستودع — يخرج من الرصيد مباشرةً بلا حفلة */
export async function addStoreDamage(data: {
  itemBarcode: string;
  quantity: number;
  reason: string;
  damageDate: string;
  createdBy: string;
}): Promise<void> {
  if (data.quantity <= 0) throw new Error("أدخل كمية صحيحة");
  const itemRef = doc(db, "cost_items", data.itemBarcode);
  const damageRef = doc(collection(db, "cost_damage"));
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error("الصنف غير مسجّل");
    const item = itemSnap.data() as Omit<CostItem, "id">;
    const balance = (item.totalIn ?? 0) - (item.totalOut ?? 0);
    if (data.quantity > balance) {
      throw new Error(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
    }
    const unitCost = balance > 0 ? (item.totalInValue ?? 0) / balance : 0;
    tx.set(damageRef, {
      itemBarcode: data.itemBarcode,
      itemName: item.name,
      unit: item.unit,
      quantity: data.quantity,
      unitCost: Math.round(unitCost * 100) / 100,
      totalCost: Math.round(unitCost * data.quantity * 100) / 100,
      reason: data.reason,
      source: "store",
      outgoingId: null,
      concertId: null,
      concertName: null,
      clientName: null,
      damageDate: data.damageDate,
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
    tx.update(itemRef, {
      totalOut: (item.totalOut ?? 0) + data.quantity,
      totalInValue: Math.max(0, (item.totalInValue ?? 0) - Math.round(unitCost * data.quantity * 100) / 100),
    });
  });
}

/** حذف قيد تالف — يرجع الكمية للرصيد فقط إن كان تلفاً في المستودع.
 *  تالف عملية صرف خرج مع الصرف نفسه، فحذف قيده لا يعيده للمخزون بل
 *  يعيد تحميل قيمته على الحفلة. */
export async function deleteCostDamage(entry: CostDamage): Promise<void> {
  const itemRef = doc(db, "cost_items", entry.itemBarcode);
  const damageRef = doc(db, "cost_damage", entry.id);
  const outRef = entry.outgoingId ? doc(db, "cost_outgoing", entry.outgoingId) : null;

  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    const outSnap = outRef ? await tx.get(outRef) : null;

    if (entry.source === "store" && itemSnap.exists()) {
      const item = itemSnap.data() as Omit<CostItem, "id">;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - entry.quantity),
        totalInValue: Math.round(((item.totalInValue ?? 0) + entry.totalCost) * 100) / 100,
      });
    }

    if (outRef && outSnap?.exists()) {
      const out = outSnap.data() as Omit<CostOutgoing, "id">;
      const newDamaged = Math.max(0, (out.damagedQty ?? 0) - entry.quantity);
      const consumed = out.quantity - (out.returnedQty ?? 0) - newDamaged;
      tx.update(outRef, {
        damagedQty: newDamaged,
        totalCost: Math.round(consumed * out.unitPrice * 100) / 100,
      });
    }

    tx.delete(damageRef);
  });
}
