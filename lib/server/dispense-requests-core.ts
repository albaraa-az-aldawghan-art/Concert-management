/* طلبات صرف الحفلات.
   ═══════════════════════════════════════════════════════════════
   عند تأكيد الحفلة يُنشأ طلب صرف بأصناف أكلها وكمياتها، معنوناً باسم
   العميل وحفلته. لا يُصرف شيء حتى يُقرّه المسؤول — والإقرار هو الذي
   ينشئ عمليات المنصرف محمَّلةً على الحفلة.

   قاعدة واحدة تحكم التحديث: المطلوب = ما في أصناف الأكل − ما سبق
   إقراره. فما دام الطلب معلّقاً يتبع تعديلاتك، وبعد إقراره تصير أي
   إضافة طلباً جديداً بالفرق وحده — فلا يُصرف صنف مرتين مهما تكرّر
   الحفظ أو أُعيد التأكيد.
   ═══════════════════════════════════════════════════════════════ */

import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { svcAddOutgoing, svcSettleOutgoing } from "@/lib/server/costs-core";
import { svcSendOrder } from "@/lib/server/kitchen-core";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RequestLine {
  barcode: string;
  itemName: string;
  unit: string;
  quantity: number;
}

/** كمية كل صنف في أصناف أكل الحفلة، مجموعةً بالباركود */
async function foodByBarcode(db: Firestore, concertId: string): Promise<Map<string, number>> {
  const snap = await db.collection("concert_food").where("concertId", "==", concertId).get();
  const m = new Map<string, number>();
  for (const d of snap.docs) {
    const f = d.data() as { costItemBarcode?: string | null; quantity?: number | null };
    /* صنف بلا باركود تكاليف لا يُصرف — لا مقابل له في المخزون */
    if (!f.costItemBarcode) continue;
    m.set(f.costItemBarcode, r2((m.get(f.costItemBarcode) ?? 0) + (f.quantity ?? 0)));
  }
  return m;
}

/** ما سبق إقراره لهذه الحفلة، مجموعاً بالباركود */
async function approvedByBarcode(db: Firestore, concertId: string): Promise<Map<string, number>> {
  const snap = await db
    .collection("dispense_requests")
    .where("concertId", "==", concertId)
    .where("status", "==", "approved")
    .get();
  const m = new Map<string, number>();
  for (const d of snap.docs) {
    for (const l of (d.data().lines ?? []) as RequestLine[]) {
      m.set(l.barcode, r2((m.get(l.barcode) ?? 0) + l.quantity));
    }
  }
  return m;
}

/** يُرجع كمية زائدة إلى المخزون من عمليات صرف الحفلة لهذا الصنف.
 *  الأحدث أولاً، ويُخصم من سطور الطلبات المُقرّة بالمقدار نفسه حتى
 *  يبقى «ما أُقرّ» مطابقاً لما هو مصروف فعلاً. */
async function returnExcess(db: Firestore, concertId: string, barcode: string, excess: number) {
  let left = excess;

  const outs = (
    await db.collection("cost_outgoing")
      .where("concertId", "==", concertId)
      .where("itemBarcode", "==", barcode)
      .get()
  ).docs.sort((a, b) => (b.data().createdAt?.seconds ?? 0) - (a.data().createdAt?.seconds ?? 0));

  for (const doc of outs) {
    if (left <= 0) break;
    const o = doc.data() as { quantity?: number; returnedQty?: number; damagedQty?: number };
    const open = r2((o.quantity ?? 0) - (o.returnedQty ?? 0) - (o.damagedQty ?? 0));
    if (open <= 0) continue;
    const take = Math.min(open, left);
    await svcSettleOutgoing(db, doc.id, {
      returnedQty: take,
      damagedQty: 0,
      reason: "",
      damageDate: new Date().toISOString().slice(0, 10),
      createdBy: "system",
    });
    left = r2(left - take);
  }

  /* سطور الطلبات المُقرّة تُنقص بما رجع فعلاً */
  let toDeduct = r2(excess - left);
  if (toDeduct <= 0) return;
  const approved = await db.collection("dispense_requests")
    .where("concertId", "==", concertId)
    .where("status", "==", "approved")
    .get();
  for (const doc of approved.docs) {
    if (toDeduct <= 0) break;
    const lines = ((doc.data().lines ?? []) as RequestLine[]).map((l) => ({ ...l }));
    const line = lines.find((l) => l.barcode === barcode && l.quantity > 0);
    if (!line) continue;
    const take = Math.min(line.quantity, toDeduct);
    line.quantity = r2(line.quantity - take);
    toDeduct = r2(toDeduct - take);
    await doc.ref.update({ lines: lines.filter((l) => l.quantity > 0) });
  }
}

/** الطلب المعلّق لهذه الحفلة، إن وُجد */
async function pendingOf(db: Firestore, concertId: string) {
  const snap = await db
    .collection("dispense_requests")
    .where("concertId", "==", concertId)
    .where("status", "==", "pending")
    .get();
  return snap.docs[0] ?? null;
}

/** يُنشئ الطلب أو يُحدّثه أو يحذفه حسب ما تبقّى — يُنادى بعد كل ما يمسّ
 *  أصناف الأكل أو حالة الحفلة، وتكراره بلا تغيير لا يفعل شيئاً. */
export async function syncDispenseRequest(db: Firestore, concertId: string, uid: string) {
  const cSnap = await db.collection("concerts").doc(concertId).get();
  if (!cSnap.exists) return;
  const c = cSnap.data() as {
    status?: string; name?: string; clientName?: string;
    concertNumber?: number; date?: Timestamp | null;
  };

  const pending = await pendingOf(db, concertId);

  /* الحفلة غير المؤكدة أو الملغاة لا طلب لها — ويُلغى المعلّق إن وُجد */
  if (c.status !== "confirmed" && c.status !== "completed") {
    if (pending) await pending.ref.delete();
    return;
  }

  const wanted = await foodByBarcode(db, concertId);
  let done = await approvedByBarcode(db, concertId);

  /* ما نقص من الحفلة يرجع للمخزون: لكل صنف صُرف أكثر مما بقي في
     أصنافها، تُرجَع الزيادة من عمليات صرفها — فتعديل الحفلة بعد
     التأكيد يُصحّح الصرف بدل أن يترك فرقاً معلّقاً. */
  for (const [barcode, approvedQty] of done) {
    const excess = r2(approvedQty - (wanted.get(barcode) ?? 0));
    if (excess <= 0) continue;
    await returnExcess(db, concertId, barcode, excess);
  }
  /* بعد الإرجاع يُعاد الحساب من الواقع لا من لقطة قديمة */
  done = await approvedByBarcode(db, concertId);

  /* المطلوب = ما في الأكل − ما أُقرّ */
  const lines: RequestLine[] = [];
  for (const [barcode, qty] of wanted) {
    const remaining = r2(qty - (done.get(barcode) ?? 0));
    if (remaining <= 0) continue;
    const iSnap = await db.collection("cost_items").doc(barcode).get();
    if (!iSnap.exists) continue; // صنف حُذف — لا يُطلب
    const item = iSnap.data() as { name?: string; unit?: string };
    lines.push({
      barcode,
      itemName: item.name ?? barcode,
      unit: item.unit ?? "",
      quantity: remaining,
    });
  }

  /* المطبخ والموارد يُخبَران بنفس اللحظة التي يُنشأ فيها الطلب —
     كان الإرسال زراً يدوياً قد يُنسى، والآن يتبع التأكيد */
  /* بلا تمرير note: إعادة إرسال آلية، لا تمسّ ملاحظة سجّلها إنسان يدوياً */
  await svcSendOrder(db, "kitchen", concertId, uid).catch(() => {});
  await svcSendOrder(db, "warehouse", concertId, uid).catch(() => {});

  if (lines.length === 0) {
    if (pending) await pending.ref.delete();
    return;
  }

  const payload = {
    concertId,
    concertNumber: c.concertNumber ?? 0,
    concertName: c.name ?? "",
    clientName: c.clientName ?? "",
    concertDate: c.date ?? null,
    lines,
    status: "pending" as const,
    updatedAt: Timestamp.now(),
  };

  if (pending) {
    await pending.ref.update(payload);
  } else {
    await db.collection("dispense_requests").add({
      ...payload,
      createdAt: Timestamp.now(),
      createdBy: uid,
      approvedAt: null,
      approvedBy: null,
    });
  }
}

/** إقرار الطلب: يصرف كل سطر على الحفلة بمتوسط تكلفته.
 *  الحالة تُقلب أولاً داخل معاملة، فإقراران متزامنان لا يصرفان مرتين. */
export async function approveDispenseRequest(
  db: Firestore,
  id: string,
  uid: string,
  departmentName: string
) {
  const ref = db.collection("dispense_requests").doc(id);

  const req = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError("الطلب غير موجود", 404);
    const r = snap.data() as {
      status: string; concertId: string; concertName: string; clientName: string;
      lines: RequestLine[];
    };
    if (r.status !== "pending") throw new ApiError("الطلب أُقرّ أو أُلغي من قبل");
    tx.update(ref, { status: "approving", approvedBy: uid, approvedAt: Timestamp.now() });
    return r;
  });

  const cSnap = await db.collection("concerts").doc(req.concertId).get();
  if (!cSnap.exists) throw new ApiError("الحفلة غير موجودة", 404);
  if (cSnap.data()?.status === "cancelled") {
    await ref.update({ status: "pending" });
    throw new ApiError("الحفلة ملغاة — لا يُصرف عليها");
  }

  const today = new Date().toISOString().slice(0, 10);
  const createdIds: string[] = [];

  try {
    for (const l of req.lines) {
      const iSnap = await db.collection("cost_items").doc(l.barcode).get();
      const item = iSnap.data() as { totalIn?: number; totalOut?: number; totalInValue?: number };
      const balance = r2((item?.totalIn ?? 0) - (item?.totalOut ?? 0));
      const avg = balance > 0 ? r2((item?.totalInValue ?? 0) / balance) : 0;

      const { id: outId } = await svcAddOutgoing(db, {
        itemBarcode: l.barcode,
        quantity: l.quantity,
        unitPrice: avg,
        departmentName,
        channel: "concerts",
        concertId: req.concertId,
        concertName: req.concertName,
        clientName: req.clientName,
        manualConcertName: null,
        contractId: null,
        contractName: null,
        dispenseDate: today,
        createdBy: uid,
      });
      createdIds.push(outId);
    }
  } catch (err) {
    /* فشل في المنتصف: ما صُرف يُعاد، والطلب يعود معلّقاً كما كان —
       فلا يبقى نصف صرف بلا طلب يذكّر به */
    for (const outId of createdIds) {
      await db.collection("cost_outgoing").doc(outId).delete().catch(() => {});
    }
    await ref.update({ status: "pending", approvedBy: null, approvedAt: null });
    throw err;
  }

  await ref.update({ status: "approved", outgoingIds: createdIds });
  return { approved: createdIds.length };
}

/** رفض الطلب: يُلغى ولا يُصرف شيء */
export async function rejectDispenseRequest(db: Firestore, id: string, uid: string, reason: string) {
  const ref = db.collection("dispense_requests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الطلب غير موجود", 404);
  if (snap.data()?.status !== "pending") throw new ApiError("الطلب أُقرّ أو أُلغي من قبل");
  await ref.update({
    status: "rejected",
    rejectedBy: uid,
    rejectedAt: Timestamp.now(),
    rejectReason: reason || null,
  });
}
