/* طبقة الوصول للبيانات: القراءات تتم من المتصفح، والكتابات تُنادي الخادم. */

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
import { api } from "@/lib/api";
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

/* الباركود الداخلي يُولَّد على الخادم الآن (lib/server/costs-core.ts)
   داخل نفس معاملة إنشاء الصنف، فلا يبقى عدّاد يتيم ولا يستطيع العميل
   القفز فوق التسلسل. */

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
  const { id } = await api.post<{ id: string }>("/api/costs/items", {
    mode: "generate",
    name: data.name,
    unit: data.unit,
    productionDate: data.productionDate ?? null,
    expiryDate: data.expiryDate ?? null,
  });
  const snap = await getDoc(doc(db, "cost_items", id));
  return { id, ...(snap.data() as Omit<CostItem, "id">) };
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
  const { id } = await api.post<{ id: string }>("/api/costs/items", {
    mode: "supplier",
    name: data.name,
    unit: data.unit,
    barcode: data.barcode,
    productionDate: data.productionDate ?? null,
    expiryDate: data.expiryDate ?? null,
  });
  const snap = await getDoc(doc(db, "cost_items", id));
  return { id, ...(snap.data() as Omit<CostItem, "id">) };
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
  await api.patch(`/api/costs/items/${encodeURIComponent(barcode)}`, data);
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
  await api.del(`/api/costs/items/${encodeURIComponent(barcode)}`);
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
  await api.post("/api/costs/incoming", {
    itemBarcode: data.itemBarcode,
    supplierName: data.supplierName,
    quantity: data.quantity,
    priceBeforeVat: data.priceBeforeVat,
    invoiceDate: data.invoiceDate,
  });
}

export async function deleteCostIncoming(entry: CostIncoming): Promise<void> {
  await api.del(`/api/costs/incoming/${entry.id}`);
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
  await api.post("/api/costs/production", {
    outputBarcode: data.outputBarcode,
    outputQty: data.outputQty,
    inputs: data.inputs,
    productionDate: data.productionDate,
    expiryDate: data.expiryDate ?? null,
    notes: data.notes,
  });
}

export async function deleteCostProduction(entry: CostProduction): Promise<void> {
  await api.del(`/api/costs/production/${entry.id}`);
}

/** حفظ الخلطة القياسية على الصنف المُنتَج — تُعبّئ نموذج الإنتاج تلقائياً */
export async function updateProductionRecipe(barcode: string, recipe: RecipeLine[]): Promise<void> {
  await api.patch(`/api/costs/items/${encodeURIComponent(barcode)}`, { productionRecipe: recipe });
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
  contractId?: string | null;
  contractName?: string | null;
  dispenseDate: string;
  createdBy: string;
}): Promise<void> {
  await api.post("/api/costs/outgoing", {
    itemBarcode: data.itemBarcode,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    departmentName: data.departmentName,
    concertId: data.concertId,
    concertName: data.concertName,
    clientName: data.clientName,
    manualConcertName: data.manualConcertName,
    contractId: data.contractId ?? null,
    contractName: data.contractName ?? null,
    dispenseDate: data.dispenseDate,
  });
}

export async function deleteCostOutgoing(entry: CostOutgoing): Promise<void> {
  await api.del(`/api/costs/outgoing/${entry.id}`);
}

/* ── التالف والمرتجع ──────────────────────────────────────────
   تسوية عملية صرف: جزء يرجع للمخزون صالحاً، وجزء تلف فلا يرجع.
   في الحالتين لا تُحمَّل الحفلة إلا ما استُهلك فعلاً، والتالف يُقيَّد
   خسارة عامة لا تكلفة حفلة — وإلا ظهر التلف وكأنه استهلاك. */

export async function settleCostOutgoing(
  entry: CostOutgoing,
  data: { returnedQty: number; damagedQty: number; reason: string; damageDate: string; createdBy: string }
): Promise<void> {
  await api.post(`/api/costs/outgoing/${entry.id}/settle`, {
    returnedQty: data.returnedQty,
    damagedQty: data.damagedQty,
    reason: data.reason,
    damageDate: data.damageDate,
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
  await api.post("/api/costs/damage", {
    itemBarcode: data.itemBarcode,
    quantity: data.quantity,
    reason: data.reason,
    damageDate: data.damageDate,
  });
}

/** حذف قيد تالف — يرجع الكمية للرصيد فقط إن كان تلفاً في المستودع.
 *  تالف عملية صرف خرج مع الصرف نفسه، فحذف قيده لا يعيده للمخزون بل
 *  يعيد تحميل قيمته على الحفلة. */
export async function deleteCostDamage(entry: CostDamage): Promise<void> {
  await api.del(`/api/costs/damage/${entry.id}`);
}
