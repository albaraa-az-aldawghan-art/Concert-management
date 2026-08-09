import { Timestamp, Firestore, Transaction } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";

/* ═══════════════════════════════════════════════════════════════
   منطق الموارد ومواد الحفلات على الخادم.

   إضافة مادة لحفلة تحجزها فوراً من «المتوفر»، وحذفها أو تأكيد إرجاعها
   يُفرج عنها. كل ذلك في معاملة واحدة حتى لا يحجز طلبان متزامنان نفس
   الكمية مرتين — وهذا بالضبط ما لا تستطيع قواعد Firestore فرضه.

   علامة stockHeld على المادة هي مفتاح السلامة: تُكتب من هنا فقط،
   والمواد المسجّلة قبل تفعيل الحجز (undefined) لا تُعاد أبداً، فلا
   يتضخّم رصيد المستودع بمواد لم تُحجز أصلاً.
   ═══════════════════════════════════════════════════════════════ */

/** هل هذه الحفلة تحجز موارد الآن؟ الملغاة والمكتملة والمُستلَمة لا تحجز */
function concertHoldsStock(c: { status?: string; warehouseReturnConfirmed?: boolean }): boolean {
  if (!c) return false;
  if (c.status === "cancelled" || c.status === "completed") return false;
  if (c.warehouseReturnConfirmed) return false;
  return true;
}

/** يعيد الكمية إلى المتوفر بلا تجاوز الإجمالي — الحدّ الأعلى يمنع
 *  تضخّم الرصيد لو تكرّر الإفراج لأي سبب */
function releaseInto(tx: Transaction, whRef: FirebaseFirestore.DocumentReference, snap: FirebaseFirestore.DocumentSnapshot, qty: number) {
  const available = (snap.data()?.availableCount as number) ?? 0;
  const total = (snap.data()?.totalCount as number) ?? 0;
  tx.update(whRef, { availableCount: Math.min(available + qty, total) });
}

/* ── مواد الحفلة ───────────────────────────────────────────── */

export async function svcAddConcertItem(
  db: Firestore,
  d: {
    concertId: string; itemId: string; itemName: string; type: "internal" | "external";
    count: number; unitCost: number | null; totalCost: number | null;
    assignedToEmployeeId: string | null; assignedToEmployeeName: string | null;
  }
) {
  const itemRef = db.collection("concert_items").doc();
  const whRef = db.collection("warehouse_items").doc(d.itemId);
  const concertRef = db.collection("concerts").doc(d.concertId);

  await db.runTransaction(async (tx) => {
    const [cSnap, whSnap] = await Promise.all([tx.get(concertRef), tx.get(whRef)]);
    if (!cSnap.exists) throw new ApiError("الحفلة غير موجودة", 404);
    if (!whSnap.exists) throw new ApiError("المادة غير موجودة في الموارد", 404);

    const hold = concertHoldsStock(cSnap.data() as { status?: string; warehouseReturnConfirmed?: boolean });
    if (hold) {
      const available = (whSnap.data()!.availableCount as number) ?? 0;
      if (available < d.count) {
        throw new ApiError(`الكمية المتوفرة من "${d.itemName}" غير كافية (المتوفر: ${available})`);
      }
      tx.update(whRef, { availableCount: available - d.count });
    }

    tx.set(itemRef, {
      ...d,
      deliveryStatus: "pending",
      returnStatus: "pending",
      stockHeld: hold,
      createdAt: Timestamp.now(),
    });
  });
  return { id: itemRef.id };
}

/** تعديل الكمية يحرّك الحجز بالفرق فقط، لا بالكمية كاملة */
export async function svcUpdateConcertItemCount(db: Firestore, itemId: string, newCount: number) {
  const itemRef = db.collection("concert_items").doc(itemId);
  await db.runTransaction(async (tx) => {
    const iSnap = await tx.get(itemRef);
    if (!iSnap.exists) throw new ApiError("المادة غير موجودة", 404);
    const item = iSnap.data() as { itemId: string; itemName: string; count: number; stockHeld?: boolean };
    const delta = newCount - item.count;

    if (item.stockHeld && delta !== 0) {
      const whRef = db.collection("warehouse_items").doc(item.itemId);
      const whSnap = await tx.get(whRef);
      if (whSnap.exists) {
        const available = (whSnap.data()!.availableCount as number) ?? 0;
        const total = (whSnap.data()!.totalCount as number) ?? 0;
        if (delta > 0 && available < delta) {
          throw new ApiError(`الكمية المتوفرة من "${item.itemName}" غير كافية (المتوفر: ${available})`);
        }
        tx.update(whRef, { availableCount: Math.min(Math.max(available - delta, 0), total) });
      }
    }
    tx.update(itemRef, { count: newCount });
  });
}

export async function svcDeleteConcertItem(db: Firestore, itemId: string) {
  const itemRef = db.collection("concert_items").doc(itemId);
  await db.runTransaction(async (tx) => {
    const iSnap = await tx.get(itemRef);
    if (!iSnap.exists) return;
    const item = iSnap.data() as { itemId: string; count: number; stockHeld?: boolean };
    if (item.stockHeld) {
      const whRef = db.collection("warehouse_items").doc(item.itemId);
      const whSnap = await tx.get(whRef);
      if (whSnap.exists) releaseInto(tx, whRef, whSnap, item.count);
    }
    tx.delete(itemRef);
  });
}

export async function svcUpdateConcertItem(
  db: Firestore,
  itemId: string,
  d: { unitCost?: number | null; totalCost?: number | null; assignedToEmployeeId?: string | null; assignedToEmployeeName?: string | null; deliveryStatus?: string; returnStatus?: string }
) {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0) return;
  await db.collection("concert_items").doc(itemId).update(patch);
}

/** يعيد حساب قيمتي مواد الحفلة — حقلان مشتقّان لا يُكتبان يدوياً:
 *  الخارجية تكلفة نقدية تدخل الربح، والداخلية أصول ترجع فلا تُخصم */
export async function svcRecalcItemCosts(db: Firestore, concertId: string) {
  const snap = await db.collection("concert_items").where("concertId", "==", concertId).get();
  const items = snap.docs.map((d) => d.data() as { type: string; totalCost?: number | null });
  const sumBy = (type: string) =>
    items.filter((i) => i.type === type).reduce((s, i) => s + ((i.totalCost as number) ?? 0), 0);

  const external = sumBy("external");
  const internal = sumBy("internal");
  await db.collection("concerts").doc(concertId).update({
    externalItemsCost: external > 0 ? external : null,
    internalItemsValue: internal > 0 ? internal : null,
  });
}

/** يُفرج عن كل ما تحجزه الحفلة — عند الإلغاء أو الحذف.
 *  آمن التكرار: المُفرَج عنه يصير stockHeld=false فلا يُعاد ثانية. */
export async function svcReleaseConcertStock(db: Firestore, concertId: string, alsoDelete = false) {
  const snap = await db.collection("concert_items").where("concertId", "==", concertId).get();
  for (const d of snap.docs) {
    const itemRef = db.collection("concert_items").doc(d.id);
    await db.runTransaction(async (tx) => {
      const iSnap = await tx.get(itemRef);
      if (!iSnap.exists) return;
      const item = iSnap.data() as { itemId: string; count: number; stockHeld?: boolean };
      if (item.stockHeld) {
        const whRef = db.collection("warehouse_items").doc(item.itemId);
        const whSnap = await tx.get(whRef);
        if (whSnap.exists) releaseInto(tx, whRef, whSnap, item.count);
      }
      if (alsoDelete) tx.delete(itemRef);
      else if (item.stockHeld) tx.update(itemRef, { stockHeld: false });
    });
  }
}

/** تأكيد استلام مواد الحفلة: يعود المحجوز ما عدا المفقود.
 *  كل مادة في معاملة مستقلة تتحقّق من stockHeld أولاً، وعلامة الحفلة
 *  تُكتب في النهاية — فالانقطاع في المنتصف لا يُضاعف الإرجاع. */
export async function svcConfirmWarehouseReturn(db: Firestore, concertId: string, uid: string) {
  const [itemsSnap, missingSnap] = await Promise.all([
    db.collection("concert_items").where("concertId", "==", concertId).get(),
    db.collection("missing_items").where("concertId", "==", concertId).get().catch(() => null),
  ]);

  const missingByItem = new Map<string, number>();
  for (const d of missingSnap?.docs ?? []) {
    const m = d.data() as { itemId: string; missingCount: number };
    missingByItem.set(m.itemId, (missingByItem.get(m.itemId) ?? 0) + (m.missingCount ?? 0));
  }

  for (const d of itemsSnap.docs) {
    const itemRef = db.collection("concert_items").doc(d.id);
    await db.runTransaction(async (tx) => {
      const iSnap = await tx.get(itemRef);
      if (!iSnap.exists) return;
      const item = iSnap.data() as { itemId: string; count: number; stockHeld?: boolean };
      if (!item.stockHeld) return; // أُفرج عنها سابقاً — لا تُعاد مرتين

      const missing = Math.min(missingByItem.get(item.itemId) ?? 0, item.count);
      const restore = Math.max(item.count - missing, 0);

      if (restore > 0) {
        const whRef = db.collection("warehouse_items").doc(item.itemId);
        const whSnap = await tx.get(whRef);
        if (whSnap.exists) releaseInto(tx, whRef, whSnap, restore);
      }
      tx.update(itemRef, { stockHeld: false, returnStatus: missing > 0 ? "has_missing" : "confirmed" });
    });
  }

  await db.collection("concerts").doc(concertId).update({
    warehouseReturnConfirmed: true,
    warehouseReturnConfirmedBy: uid,
    warehouseReturnConfirmedAt: Timestamp.now(),
  });
}

/** التراجع عن تأكيد الاستلام: يُعاد حجز ما أُفرج عنه.
 *
 *  التأكيد هو الخطوة الوحيدة في سير العمل التي تحرّك المخزون فعلاً،
 *  فالتراجع عنه لا يكفي فيه محو علامة — لو مُحيت وحدها لبقيت المواد
 *  في «المتوفر» وهي عند الحفلة، فيُصرف منها مرتين.
 *
 *  ولأن غيرها قد يكون حجز تلك الكمية بعد الإفراج، يُتحقّق من كفاية
 *  المتوفر أولاً لكل المواد: إما أن يتراجع الكل أو لا شيء. */
export async function svcUndoWarehouseReturn(db: Firestore, concertId: string, uid: string) {
  const cRef = db.collection("concerts").doc(concertId);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  if (!cSnap.data()!.warehouseReturnConfirmed) throw new ApiError("لم يُؤكَّد الاستلام أصلاً");

  const [itemsSnap, missingSnap] = await Promise.all([
    db.collection("concert_items").where("concertId", "==", concertId).get(),
    db.collection("missing_items").where("concertId", "==", concertId).get().catch(() => null),
  ]);

  const missingByItem = new Map<string, number>();
  for (const d of missingSnap?.docs ?? []) {
    const m = d.data() as { itemId: string; missingCount: number };
    missingByItem.set(m.itemId, (missingByItem.get(m.itemId) ?? 0) + (m.missingCount ?? 0));
  }

  /* ما أعاده التأكيد هو ما نستردّه: المواد التي ختمها بـconfirmed أو
     has_missing. ما أُفرج عنه لسبب آخر (حذف، إلغاء) لا يُمَسّ. */
  const toHold = itemsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as { itemId: string; itemName: string; count: number; stockHeld?: boolean; returnStatus?: string }) }))
    .filter((i) => !i.stockHeld && (i.returnStatus === "confirmed" || i.returnStatus === "has_missing"))
    .map((i) => ({ ...i, qty: Math.max(i.count - Math.min(missingByItem.get(i.itemId) ?? 0, i.count), 0) }))
    .filter((i) => i.qty > 0);

  const needByItem = new Map<string, number>();
  for (const i of toHold) needByItem.set(i.itemId, (needByItem.get(i.itemId) ?? 0) + i.qty);
  for (const [itemId, need] of needByItem) {
    const whSnap = await db.collection("warehouse_items").doc(itemId).get();
    if (!whSnap.exists) continue; // مادة حُذفت من الموارد — لا شيء يُحجز
    const available = (whSnap.data()!.availableCount as number) ?? 0;
    if (available < need) {
      const name = toHold.find((i) => i.itemId === itemId)?.itemName ?? itemId;
      throw new ApiError(
        `تعذّر التراجع: "${name}" حُجزت بعد إرجاعها ولم يبقَ منها ما يكفي (المطلوب ${need} · المتوفر ${available})`
      );
    }
  }

  for (const i of toHold) {
    const itemRef = db.collection("concert_items").doc(i.id);
    await db.runTransaction(async (tx) => {
      const iSnap = await tx.get(itemRef);
      if (!iSnap.exists) return;
      if (iSnap.data()!.stockHeld) return; // أُعيد حجزها في هذه الأثناء
      const whRef = db.collection("warehouse_items").doc(i.itemId);
      const whSnap = await tx.get(whRef);
      if (whSnap.exists) {
        const available = (whSnap.data()!.availableCount as number) ?? 0;
        if (available < i.qty) throw new ApiError(`تعذّر التراجع: "${i.itemName}" لم يعد متوفراً`);
        tx.update(whRef, { availableCount: available - i.qty });
      }
      tx.update(itemRef, { stockHeld: true, returnStatus: "pending" });
    });
  }

  await cRef.update({
    warehouseReturnConfirmed: false,
    warehouseReturnConfirmedBy: null,
    warehouseReturnConfirmedAt: null,
  });
  await db.collection("concert_logs").add({
    concertId, createdBy: uid, createdAt: Timestamp.now(),
    description: `سير العمل — تراجُع عن: تأكيد الموارد استلام المواد`
      + (toHold.length ? ` — أُعيد حجز ${toHold.length} مادة` : ""),
  });
}

/* ── مواد الموارد نفسها ────────────────────────────────────── */

export async function svcAddWarehouseItem(
  db: Firestore,
  d: { name: string; totalCount: number; type: "internal" | "external"; pricePerUnit: number | null; imageUrl: string | null }
) {
  const ref = db.collection("warehouse_items").doc();
  await ref.set({
    ...d,
    availableCount: d.totalCount, // مادة جديدة متاحة بالكامل
    createdAt: Timestamp.now(),
  });
  return { id: ref.id };
}

/** تعديل الإجمالي يحرّك المتاح بنفس الفرق: إضافة عشر طاولات تزيد
 *  المتاح عشراً، ولا تُلغي ما هو محجوز لحفلات قائمة */
export async function svcUpdateWarehouseItem(
  db: Firestore,
  id: string,
  d: { name?: string; totalCount?: number; type?: string; pricePerUnit?: number | null; imageUrl?: string | null; order?: number }
) {
  const ref = db.collection("warehouse_items").doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError("المادة غير موجودة", 404);
    const cur = snap.data() as { totalCount: number; availableCount: number };

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) if (v !== undefined && k !== "totalCount") patch[k] = v;

    if (d.totalCount !== undefined && d.totalCount !== cur.totalCount) {
      const delta = d.totalCount - cur.totalCount;
      const held = cur.totalCount - cur.availableCount; // المحجوز الآن
      if (d.totalCount < held) {
        throw new ApiError(`لا يمكن إنقاص الإجمالي إلى ${d.totalCount} — ${held} محجوزة لحفلات قائمة`);
      }
      patch.totalCount = d.totalCount;
      patch.availableCount = Math.max(0, cur.availableCount + delta);
    }
    tx.update(ref, patch);
  });
}

export async function svcDeleteWarehouseItem(db: Firestore, id: string) {
  // مادة محجوزة أو مستعملة في حفلة: حذفها يترك مواد حفلة يتيمة ويُفقد
  // الحجز إلى الأبد، فيُمنع ويُشرح السبب
  const used = await db.collection("concert_items").where("itemId", "==", id).limit(1).get();
  if (!used.empty) {
    throw new ApiError("لا يمكن حذف هذه المادة — مستعملة في حفلات مسجّلة. احذفها من الحفلات أولاً.");
  }
  await db.collection("warehouse_items").doc(id).delete();
}

export async function svcReorderWarehouse(db: Firestore, orderedIds: string[]) {
  const batch = db.batch();
  orderedIds.forEach((id, i) => batch.update(db.collection("warehouse_items").doc(id), { order: i }));
  await batch.commit();
}

/* ── المفقودات ─────────────────────────────────────────────── */

export async function svcReportMissing(
  db: Firestore,
  d: {
    concertId: string; concertNumber: number | null; itemId: string; itemName: string;
    missingCount: number; employeeId: string | null; employeeName: string | null;
    notes: string | null; reportedBy: string;
  }
) {
  const itemsSnap = await db
    .collection("concert_items")
    .where("concertId", "==", d.concertId)
    .where("itemId", "==", d.itemId)
    .get();

  const taken = itemsSnap.docs.reduce((s, x) => s + ((x.data().count as number) ?? 0), 0);
  if (taken > 0 && d.missingCount > taken) {
    throw new ApiError(`المفقود (${d.missingCount}) أكبر من الكمية المأخوذة للحفلة (${taken})`);
  }

  const ref = db.collection("missing_items").doc();
  await ref.set({ ...d, createdAt: Timestamp.now() });
  return { id: ref.id };
}
