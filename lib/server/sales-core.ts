import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";

/* ═══════════════════════════════════════════════════════════════
   منتجات البيع والبكجات على الخادم.

   الهيكل ثلاث طبقات: مواد أولية ← تصنيع ← منتجات بيع. وأقسام البيع
   مملوكة لقنواتها، فقسم «المعجنات» في المطعم غير قسم «المعجنات» في
   معهد أرامكو ولو تشابه الاسم.

   الصنف المعروض للبيع مصدره التكاليف دائماً — خاماً أو مُنتَجاً — فلا
   يظهر في الحفلات اسم لم يمرّ على المخزون ولا تُعرف تكلفته.
   ═══════════════════════════════════════════════════════════════ */

const CHANNELS = ["restaurant", "concerts", "contracts"];

/* ── أقسام البيع ── */

export async function svcCreateSection(
  db: Firestore,
  d: { channel: string; name: string; createdBy: string }
) {
  if (!CHANNELS.includes(d.channel)) throw new ApiError("قناة بيع غير معروفة");

  // الاسم يتكرّر بين القنوات لا داخلها
  const dup = await db
    .collection("sales_sections")
    .where("channel", "==", d.channel)
    .where("name", "==", d.name)
    .limit(1)
    .get();
  if (!dup.empty) throw new ApiError(`قسم بهذا الاسم موجود في هذه القناة`);

  const existing = await db.collection("sales_sections").where("channel", "==", d.channel).get();
  const ref = db.collection("sales_sections").doc();
  await ref.set({
    channel: d.channel,
    name: d.name,
    order: existing.size,
    createdAt: Timestamp.now(),
    createdBy: d.createdBy,
  });
  return { id: ref.id };
}

export async function svcUpdateSection(db: Firestore, id: string, d: { name?: string; order?: number }) {
  const ref = db.collection("sales_sections").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("القسم غير موجود", 404);

  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) {
    const dup = await db
      .collection("sales_sections")
      .where("channel", "==", snap.data()!.channel)
      .where("name", "==", d.name)
      .limit(1)
      .get();
    if (!dup.empty && dup.docs[0].id !== id) throw new ApiError("قسم بهذا الاسم موجود في هذه القناة");
    patch.name = d.name;
  }
  if (d.order !== undefined) patch.order = d.order;
  if (Object.keys(patch).length) await ref.update(patch);
}

/** حذف القسم ينزع إشارته من كل صنف — وإلا بقيت أصناف تشير لقسم مفقود
 *  فتختفي من كل القوائم بلا سبب ظاهر */
export async function svcDeleteSection(db: Firestore, id: string) {
  const items = await db.collection("cost_items").where("salesSections", "array-contains", id).get();
  const batch = db.batch();
  for (const d of items.docs) {
    const list = ((d.data().salesSections as string[]) ?? []).filter((s) => s !== id);
    batch.update(d.ref, { salesSections: list });
  }
  batch.delete(db.collection("sales_sections").doc(id));
  await batch.commit();
  return { detached: items.size };
}

/** تعيين أقسام البيع لصنف — استبدال كامل للقائمة */
export async function svcSetItemSections(db: Firestore, barcode: string, sectionIds: string[]) {
  const ref = db.collection("cost_items").doc(barcode);
  if (!(await ref.get()).exists) throw new ApiError("الصنف غير موجود", 404);

  // كل معرّف يجب أن يكون قسماً حقيقياً، وإلا ظهر الصنف في العدم
  const unique = [...new Set(sectionIds.filter(Boolean))];
  for (const id of unique) {
    if (!(await db.collection("sales_sections").doc(id).get()).exists) {
      throw new ApiError("أحد الأقسام المختارة غير موجود");
    }
  }
  await ref.update({ salesSections: unique });
}

/* ── البكجات ── */

interface PackageInput {
  name: string;
  notes: string | null;
  items: { barcode: string; quantity: number }[];
  materials: { itemId: string; count: number }[];
  createdBy: string;
}

/** يبني البكج من معرّفات فقط: الأسماء والوحدات تُقرأ من المصدر لا من
 *  العميل، فلا يُحفظ اسم لا يطابق الصنف الحقيقي */
async function buildPackageBody(db: Firestore, d: PackageInput) {
  const items: ConcertPackageItem[] = [];
  for (const it of d.items) {
    const snap = await db.collection("cost_items").doc(it.barcode).get();
    if (!snap.exists) throw new ApiError(`صنف غير مسجّل: ${it.barcode}`);
    const x = snap.data()!;
    const sectionId = ((x.salesSections as string[]) ?? [])[0] ?? null;
    let sectionName: string | null = null;
    if (sectionId) {
      const s = await db.collection("sales_sections").doc(sectionId).get();
      sectionName = s.exists ? ((s.data()!.name as string) ?? null) : null;
    }
    items.push({
      barcode: it.barcode,
      itemName: (x.name as string) ?? "",
      unit: (x.unit as string) ?? "",
      quantity: it.quantity,
      sectionId,
      sectionName,
    });
  }

  const materials: ConcertPackageMaterial[] = [];
  for (const m of d.materials) {
    const snap = await db.collection("warehouse_items").doc(m.itemId).get();
    if (!snap.exists) throw new ApiError("مادة موارد غير موجودة");
    const x = snap.data()!;
    materials.push({
      itemId: m.itemId,
      itemName: (x.name as string) ?? "",
      type: (x.type as "internal" | "external") ?? "external",
      count: m.count,
    });
  }
  return { items, materials };
}

interface ConcertPackageItem {
  barcode: string; itemName: string; unit: string; quantity: number;
  sectionId: string | null; sectionName: string | null;
}
interface ConcertPackageMaterial {
  itemId: string; itemName: string; type: "internal" | "external"; count: number;
}

export async function svcCreatePackage(db: Firestore, d: PackageInput) {
  if (d.items.length === 0 && d.materials.length === 0) {
    throw new ApiError("البكج فارغ — أضف صنفاً أو مادة واحدة على الأقل");
  }
  const body = await buildPackageBody(db, d);
  const ref = db.collection("packages").doc();
  await ref.set({
    name: d.name,
    notes: d.notes,
    ...body,
    createdAt: Timestamp.now(),
    createdBy: d.createdBy,
  });
  return { id: ref.id };
}

export async function svcUpdatePackage(db: Firestore, id: string, d: PackageInput) {
  const ref = db.collection("packages").doc(id);
  if (!(await ref.get()).exists) throw new ApiError("البكج غير موجود", 404);
  if (d.items.length === 0 && d.materials.length === 0) {
    throw new ApiError("البكج فارغ — أضف صنفاً أو مادة واحدة على الأقل");
  }
  const body = await buildPackageBody(db, d);
  await ref.update({ name: d.name, notes: d.notes, ...body });
}

export async function svcDeletePackage(db: Firestore, id: string) {
  await db.collection("packages").doc(id).delete();
}
