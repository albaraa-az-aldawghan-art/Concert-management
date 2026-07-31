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
import { CostItem, CostIncoming, CostOutgoing, CostSettings, CostDepartment } from "@/types";

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
  data: Partial<Pick<CostItem, "name" | "unit">>
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

export async function deleteCostItem(barcode: string): Promise<void> {
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
      tx.update(itemRef, {
        totalIn: Math.max(0, (item.totalIn ?? 0) - entry.quantity),
        totalInValue: Math.max(0, (item.totalInValue ?? 0) - entry.totalBeforeVat),
      });
    }
    tx.delete(entryRef);
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
    tx.set(outgoingRef, {
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
      createdAt: Timestamp.now(),
      createdBy: data.createdBy,
    });
    tx.update(itemRef, { totalOut: (item.totalOut ?? 0) + data.quantity });
  });
}

export async function deleteCostOutgoing(entry: CostOutgoing): Promise<void> {
  const itemRef = doc(db, "cost_items", entry.itemBarcode);
  const entryRef = doc(db, "cost_outgoing", entry.id);
  await runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (itemSnap.exists()) {
      const item = itemSnap.data() as Omit<CostItem, "id">;
      tx.update(itemRef, { totalOut: Math.max(0, (item.totalOut ?? 0) - entry.quantity) });
    }
    tx.delete(entryRef);
  });
}
