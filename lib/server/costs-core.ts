import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";
import { OutgoingChannel } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   منطق التكاليف على الخادم — المصدر الوحيد لكل رقم يمسّ المخزون.

   كل دالة هنا تُجري معاملة واحدة: تقرأ ثم تتحقّق ثم تكتب. العميل
   يرسل ما يريد فعله لا نتيجته، فلا يستطيع كتابة رصيد أو قيمة من عنده.

   قاعدة التكلفة: totalInValue = قيمة ما في اليد. ترتفع بالوارد
   والإنتاج وتنخفض بالصرف والتالف، فالمتوسط = القيمة ÷ الرصيد.
   ═══════════════════════════════════════════════════════════════ */

const r2 = (n: number) => Math.round(n * 100) / 100;

interface ItemDoc {
  name: string;
  unit: string;
  totalIn?: number;
  totalOut?: number;
  totalInValue?: number;
  expiryDate?: string | null;
  salesSections?: string[];
}

function balanceOf(i: ItemDoc) {
  return (i.totalIn ?? 0) - (i.totalOut ?? 0);
}
function avgOf(i: ItemDoc) {
  const b = balanceOf(i);
  return b > 0 ? (i.totalInValue ?? 0) / b : 0;
}

/* ── الوارد ────────────────────────────────────────────────── */

export async function svcAddIncoming(
  db: Firestore,
  d: { itemBarcode: string; supplierName: string; quantity: number; priceBeforeVat: number; invoiceDate: string; createdBy: string }
) {
  const itemRef = db.collection("cost_items").doc(d.itemBarcode);
  const entryRef = db.collection("cost_incoming").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ApiError("الصنف غير مسجّل — سجّله أولاً من صفحة أصناف التكاليف");
    const item = snap.data() as ItemDoc;

    const totalBeforeVat = r2(d.quantity * d.priceBeforeVat);
    tx.set(entryRef, {
      itemBarcode: d.itemBarcode,
      itemName: item.name,
      unit: item.unit,
      supplierName: d.supplierName,
      quantity: d.quantity,
      priceBeforeVat: d.priceBeforeVat,
      totalBeforeVat,
      invoiceDate: d.invoiceDate,
      createdAt: Timestamp.now(),
      createdBy: d.createdBy,
    });
    tx.update(itemRef, {
      totalIn: (item.totalIn ?? 0) + d.quantity,
      totalInValue: r2((item.totalInValue ?? 0) + totalBeforeVat),
    });
  });
  return { id: entryRef.id };
}

export async function svcDeleteIncoming(db: Firestore, id: string) {
  const entryRef = db.collection("cost_incoming").doc(id);
  await db.runTransaction(async (tx) => {
    const eSnap = await tx.get(entryRef);
    if (!eSnap.exists) throw new ApiError("العملية غير موجودة", 404);
    const e = eSnap.data() as { itemBarcode: string; quantity: number; totalBeforeVat: number };
    const itemRef = db.collection("cost_items").doc(e.itemBarcode);
    const iSnap = await tx.get(itemRef);

    if (iSnap.exists) {
      const item = iSnap.data() as ItemDoc;
      const balance = balanceOf(item);
      if (e.quantity > balance) {
        throw new ApiError(
          `لا يمكن حذف هذا الوارد — المتبقي من "${item.name}" ${balance} ${item.unit} فقط والحذف يسحب ${e.quantity}. احذف عمليات الصرف أو التالف المرتبطة أولاً.`
        );
      }
      /* استُهلك جزء من الصنف بعد هذا الوارد؟ حذفه حينها يترك متوسطاً
         لا يمثّل أي سعر شراء حقيقي — لأن ما خرج خرج بمتوسط مخلوط لا
         يمكن فكّه. يُمنع الحذف ويُوجَّه إلى التصحيح بوارد معاكس. */
      if ((item.totalOut ?? 0) > 0) {
        throw new ApiError(
          `لا يمكن حذف هذا الوارد — صُرف من "${item.name}" بعده، وحذفه يترك متوسط تكلفة لا يمثّل سعر شراء حقيقي. صحّح بوارد معاكس أو عدّل العملية.`
        );
      }
      tx.update(itemRef, {
        totalIn: (item.totalIn ?? 0) - e.quantity,
        totalInValue: Math.max(0, r2((item.totalInValue ?? 0) - e.totalBeforeVat)),
      });
    }
    tx.delete(entryRef);
  });
}

/* ── المنصرف ───────────────────────────────────────────────── */

/** يتحقّق أن الوجهة صالحة وأن ما تستلزمه موجود.
 *  يُنادى من التسجيل ومن إعادة الإسناد معاً، فلا تنفرد إحداهما بقاعدة. */
export async function assertChannel(
  db: Firestore,
  channel: string | null | undefined,
  d: { concertId: string | null; manualConcertName: string | null; contractId: string | null }
): Promise<OutgoingChannel> {
  const known: OutgoingChannel[] = ["restaurant", "concerts", "contracts", "general"];
  if (!channel) throw new ApiError("حدّد وجهة الصرف: مطعم أو حفلة أو عقد أو عام");
  if (!known.includes(channel as OutgoingChannel)) throw new ApiError("وجهة صرف غير معروفة");
  const ch = channel as OutgoingChannel;

  if (ch === "concerts") {
    /* الاسم اليدوي مقبول لكنه لا يُحمَّل على حفلة — تحذيره في الواجهة */
    if (!d.concertId && !d.manualConcertName) {
      throw new ApiError("اختر الحفلة التي تُحمَّل عليها التكلفة");
    }
    if (d.concertId) {
      const snap = await db.collection("concerts").doc(d.concertId).get();
      if (!snap.exists) throw new ApiError("الحفلة غير موجودة");
      if (snap.data()?.status === "cancelled") throw new ApiError("الحفلة ملغاة — لا تُحمَّل عليها تكلفة");
    }
  }

  if (ch === "contracts") {
    if (!d.contractId) throw new ApiError("اختر العقد الذي تُحمَّل عليه التكلفة");
    const snap = await db.collection("contracts").doc(d.contractId).get();
    if (!snap.exists) throw new ApiError("العقد غير موجود");
    if (snap.data()?.status !== "active") throw new ApiError("العقد غير سارٍ — لا تُحمَّل عليه تكلفة");
  }

  return ch;
}

export async function svcAddOutgoing(
  db: Firestore,
  d: {
    itemBarcode: string; quantity: number; unitPrice: number; departmentName: string;
    concertId: string | null; concertName: string | null; clientName: string | null;
    manualConcertName: string | null;
    contractId: string | null; contractName: string | null;
    channel: string | null;
    dispenseDate: string; createdBy: string;
  }
) {
  /* الوجهة تُتحقَّق قبل فتح المعاملة — قراءات خارجية لا تصحّ داخلها */
  const channel = await assertChannel(db, d.channel, d);

  const itemRef = db.collection("cost_items").doc(d.itemBarcode);
  const entryRef = db.collection("cost_outgoing").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ApiError("الصنف غير مسجّل");
    const item = snap.data() as ItemDoc;

    const balance = balanceOf(item);
    if (d.quantity > balance) {
      throw new ApiError(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
    }

    const stockValue = r2(avgOf(item) * d.quantity);
    tx.set(entryRef, {
      itemBarcode: d.itemBarcode,
      itemName: item.name,
      unit: item.unit,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      totalCost: r2(d.quantity * d.unitPrice),
      stockValue,
      departmentName: d.departmentName,
      channel,
      /* ما لا تستلزمه القناة يُفرَّغ: عملية مطعم لا تحمل بقايا حفلة
         اختيرت ثم بُدِّلت القناة قبل الحفظ */
      concertId:  channel === "concerts" ? d.concertId : null,
      concertName: channel === "concerts" ? d.concertName : null,
      clientName:  channel === "concerts" ? d.clientName : null,
      manualConcertName: channel === "concerts" ? d.manualConcertName : null,
      contractId:   channel === "contracts" ? d.contractId : null,
      contractName: channel === "contracts" ? d.contractName : null,
      dispenseDate: d.dispenseDate,
      returnedQty: 0,
      damagedQty: 0,
      createdAt: Timestamp.now(),
      createdBy: d.createdBy,
    });
    tx.update(itemRef, {
      totalOut: (item.totalOut ?? 0) + d.quantity,
      totalInValue: Math.max(0, r2((item.totalInValue ?? 0) - stockValue)),
    });
  });
  return { id: entryRef.id };
}

export async function svcDeleteOutgoing(db: Firestore, id: string) {
  const entryRef = db.collection("cost_outgoing").doc(id);
  await db.runTransaction(async (tx) => {
    const eSnap = await tx.get(entryRef);
    if (!eSnap.exists) throw new ApiError("العملية غير موجودة", 404);
    const e = eSnap.data() as { itemBarcode: string; quantity: number; returnedQty?: number; stockValue?: number };
    const itemRef = db.collection("cost_items").doc(e.itemBarcode);
    const iSnap = await tx.get(itemRef);

    // ما رجع سبق أن أُعيد للرصيد، فلا يُعاد مرتين
    const stillOut = e.quantity - (e.returnedQty ?? 0);
    const perUnit = e.quantity > 0 ? (e.stockValue ?? 0) / e.quantity : 0;

    if (iSnap.exists) {
      const item = iSnap.data() as ItemDoc;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - stillOut),
        totalInValue: r2((item.totalInValue ?? 0) + perUnit * stillOut),
      });
    }
    tx.delete(entryRef);
  });
}

export async function svcSettleOutgoing(
  db: Firestore,
  id: string,
  d: { returnedQty: number; damagedQty: number; reason: string; damageDate: string; createdBy: string }
) {
  const entryRef = db.collection("cost_outgoing").doc(id);
  const damageRef = db.collection("cost_damage").doc();

  await db.runTransaction(async (tx) => {
    const eSnap = await tx.get(entryRef);
    if (!eSnap.exists) throw new ApiError("العملية غير موجودة", 404);
    const e = eSnap.data() as {
      itemBarcode: string; itemName: string; unit: string; quantity: number; unitPrice: number;
      stockValue?: number; returnedQty?: number; damagedQty?: number;
      concertId?: string | null; concertName?: string | null; clientName?: string | null;
    };
    const itemRef = db.collection("cost_items").doc(e.itemBarcode);
    const iSnap = await tx.get(itemRef);

    const returned = r2(d.returnedQty), damaged = r2(d.damagedQty);
    if (returned < 0 || damaged < 0) throw new ApiError("الكميات لا تقبل قيماً سالبة");
    if (returned + damaged <= 0) throw new ApiError("أدخل كمية مرتجعة أو تالفة");

    const already = (e.returnedQty ?? 0) + (e.damagedQty ?? 0);
    const remaining = e.quantity - already;
    if (returned + damaged > remaining + 1e-9) {
      throw new ApiError(`المتبقي من هذه العملية ${remaining} ${e.unit} فقط`);
    }

    const newReturned = (e.returnedQty ?? 0) + returned;
    const newDamaged = (e.damagedQty ?? 0) + damaged;
    const consumed = e.quantity - newReturned - newDamaged;
    const perUnit = e.quantity > 0 ? (e.stockValue ?? 0) / e.quantity : 0;

    tx.update(entryRef, {
      returnedQty: newReturned,
      damagedQty: newDamaged,
      totalCost: r2(consumed * e.unitPrice),
    });

    // المرتجع وحده يعود للرصيد بقيمته التي خرج بها
    if (returned > 0 && iSnap.exists) {
      const item = iSnap.data() as ItemDoc;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - returned),
        totalInValue: r2((item.totalInValue ?? 0) + perUnit * returned),
      });
    }

    if (damaged > 0) {
      tx.set(damageRef, {
        itemBarcode: e.itemBarcode,
        itemName: e.itemName,
        unit: e.unit,
        quantity: damaged,
        unitCost: e.unitPrice,
        totalCost: r2(damaged * e.unitPrice),
        reason: d.reason,
        source: "outgoing",
        outgoingId: id,
        concertId: e.concertId ?? null,
        concertName: e.concertName ?? null,
        clientName: e.clientName ?? null,
        damageDate: d.damageDate,
        createdAt: Timestamp.now(),
        createdBy: d.createdBy,
      });
    }
  });
}

/* ── تعديل عملية صرف قائمة ─────────────────────────────────────
   الحفلة تُصرف مرة، أما عقد المقصف فيُعدَّل يومه مراراً حتى يُقفل.
   الحذف وإعادة الإنشاء يعيد التسعير بمتوسط لحظةٍ أخرى فينحرف التاريخ،
   ولذلك تُحرَّك الكمية بالفرق وحده: الزيادة تخرج بمتوسط اليوم، والنقص
   يعود بالقيمة التي خرج بها فعلاً (stockValue ÷ quantity) — فمهما
   عُدِّل الرقم صعوداً ونزولاً عاد المخزون وقيمته إلى ما كانا عليه.

   لا يستدعيها شيء من المسارات القائمة: أُضيفت للجدول اليومي وحده.  */
export async function svcAdjustOutgoingQty(db: Firestore, id: string, newQty: number) {
  if (newQty < 0) throw new ApiError("الكمية لا تقبل قيمة سالبة");
  const entryRef = db.collection("cost_outgoing").doc(id);

  await db.runTransaction(async (tx) => {
    const eSnap = await tx.get(entryRef);
    if (!eSnap.exists) throw new ApiError("عملية الصرف غير موجودة", 404);
    const e = eSnap.data() as {
      itemBarcode: string; itemName: string; unit: string; quantity: number;
      unitPrice: number; stockValue?: number; returnedQty?: number; damagedQty?: number;
    };
    const delta = r2(newQty - e.quantity);
    if (delta === 0) return;

    const settled = (e.returnedQty ?? 0) + (e.damagedQty ?? 0);
    if (newQty < settled) {
      throw new ApiError(`لا تُنقص الكمية دون ${settled} — هذا ما حُسم منها إرجاعاً أو تلفاً`);
    }

    const itemRef = db.collection("cost_items").doc(e.itemBarcode);
    const iSnap = await tx.get(itemRef);
    if (!iSnap.exists) throw new ApiError("الصنف غير مسجّل");
    const item = iSnap.data() as ItemDoc;

    let valueDelta: number; // ما يخرج من قيمة المخزون (+) أو يعود إليها (−)
    if (delta > 0) {
      const balance = balanceOf(item);
      if (delta > balance + 1e-9) {
        throw new ApiError(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
      }
      valueDelta = r2(avgOf(item) * delta);
    } else {
      const perUnit = e.quantity > 0 ? (e.stockValue ?? 0) / e.quantity : 0;
      valueDelta = r2(perUnit * delta); // سالب — يعود للمخزون
    }

    const consumed = r2(newQty - settled);
    tx.update(entryRef, {
      quantity: newQty,
      stockValue: Math.max(0, r2((e.stockValue ?? 0) + valueDelta)),
      totalCost: r2(consumed * e.unitPrice),
    });
    tx.update(itemRef, {
      totalOut: Math.max(0, r2((item.totalOut ?? 0) + delta)),
      totalInValue: Math.max(0, r2((item.totalInValue ?? 0) - valueDelta)),
    });
  });
}

/** ضبط التالف على قيمة مطلقة لا تراكمية.
 *
 *  svcSettleOutgoing تُضيف إلى ما سبق، وهو الصواب حين يصل الإرجاع
 *  دفعات. أما الجدول اليومي فيعيد إرسال حالة اليوم كاملة كل حفظ، فلو
 *  جُمعت لتضاعف التالف بكل ضغطة حفظ. ولذلك مستند التالف هنا معرّفه
 *  مشتقّ من عملية الصرف: يُعاد كتابته لا يُكرَّر.
 *
 *  التالف لا يعود للمخزون — خرج فعلاً — ولا يُحمَّل على العقد: يُطرح
 *  من totalCost ويُسجَّل تالفاً عاماً، تماماً كما يفعل الموقع اليوم.  */
export async function svcSetOutgoingDamage(
  db: Firestore,
  id: string,
  d: { damagedQty: number; reason: string; damageDate: string; createdBy: string }
) {
  if (d.damagedQty < 0) throw new ApiError("التالف لا يقبل قيمة سالبة");
  const entryRef = db.collection("cost_outgoing").doc(id);
  const damageRef = db.collection("cost_damage").doc(`out_${id}`);

  await db.runTransaction(async (tx) => {
    const eSnap = await tx.get(entryRef);
    if (!eSnap.exists) throw new ApiError("عملية الصرف غير موجودة", 404);
    const e = eSnap.data() as {
      itemBarcode: string; itemName: string; unit: string; quantity: number;
      unitPrice: number; returnedQty?: number; damagedQty?: number;
      contractId?: string | null; contractName?: string | null;
    };
    const dmg = r2(d.damagedQty);
    if (dmg + (e.returnedQty ?? 0) > e.quantity + 1e-9) {
      throw new ApiError(`التالف ${dmg} أكثر من المصروف ${e.quantity} ${e.unit}`);
    }
    const consumed = r2(e.quantity - (e.returnedQty ?? 0) - dmg);
    tx.update(entryRef, { damagedQty: dmg, totalCost: r2(consumed * e.unitPrice) });

    if (dmg > 0) {
      tx.set(damageRef, {
        itemBarcode: e.itemBarcode,
        itemName: e.itemName,
        unit: e.unit,
        quantity: dmg,
        unitCost: e.unitPrice,
        totalCost: r2(dmg * e.unitPrice),
        reason: d.reason,
        source: "outgoing",
        outgoingId: id,
        concertId: null,
        concertName: null,
        clientName: null,
        contractId: e.contractId ?? null,
        contractName: e.contractName ?? null,
        damageDate: d.damageDate,
        createdAt: Timestamp.now(),
        createdBy: d.createdBy,
      });
    } else {
      tx.delete(damageRef); // عاد التالف صفراً — لا يبقى قيد بلا كمية
    }
  });
}

/* ── الإنتاج ───────────────────────────────────────────────── */

export async function svcAddProduction(
  db: Firestore,
  d: {
    outputBarcode: string; outputQty: number; inputs: { barcode: string; qty: number }[];
    /** أقسام البيع التي يُضمّ إليها المنتج — إلزامية، فمنتج بلا قسم
     *  لا يظهر عند الصرف ولا عند اختيار أصناف الحفلة */
    sectionIds: string[];
    productionDate: string; expiryDate: string | null; notes: string | null; createdBy: string;
  }
) {
  if (d.inputs.length === 0) throw new ApiError("أضف مادة خام واحدة على الأقل");

  /* الأقسام تُتحقَّق قبل المعاملة — قراءات خارجية لا تصحّ داخلها */
  const sections = [...new Set((d.sectionIds ?? []).filter(Boolean))];
  if (sections.length === 0) throw new ApiError("اختر القسم الذي يُضمّ إليه المنتج");
  for (const id of sections) {
    if (!(await db.collection("sales_sections").doc(id).get()).exists) {
      throw new ApiError("أحد الأقسام المختارة غير موجود");
    }
  }
  if (d.inputs.some((i) => i.barcode === d.outputBarcode)) {
    throw new ApiError("لا يمكن أن يكون الصنف المُنتَج أحد مدخلاته");
  }
  const seen = new Set<string>();
  for (const i of d.inputs) {
    if (seen.has(i.barcode)) throw new ApiError("تكرّرت مادة خام في المدخلات");
    seen.add(i.barcode);
  }

  const outputRef = db.collection("cost_items").doc(d.outputBarcode);
  const inputRefs = d.inputs.map((i) => db.collection("cost_items").doc(i.barcode));
  const prodRef = db.collection("cost_production").doc();

  await db.runTransaction(async (tx) => {
    const outSnap = await tx.get(outputRef);
    if (!outSnap.exists) throw new ApiError("الصنف المُنتَج غير مسجّل");
    const inSnaps = await Promise.all(inputRefs.map((r) => tx.get(r)));

    const output = outSnap.data() as ItemDoc;
    const lines: { barcode: string; itemName: string; unit: string; qty: number; unitCost: number; totalCost: number }[] = [];
    let totalCost = 0;

    for (let i = 0; i < d.inputs.length; i++) {
      const snap = inSnaps[i];
      if (!snap.exists) throw new ApiError("إحدى المواد الخام غير مسجّلة");
      const item = snap.data() as ItemDoc;
      const balance = balanceOf(item);
      if (d.inputs[i].qty > balance) {
        throw new ApiError(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
      }
      const unitCost = avgOf(item);
      const lineCost = r2(unitCost * d.inputs[i].qty);
      totalCost += lineCost;
      lines.push({
        barcode: d.inputs[i].barcode, itemName: item.name, unit: item.unit,
        qty: d.inputs[i].qty, unitCost: r2(unitCost), totalCost: lineCost,
      });
    }

    totalCost = r2(totalCost);
    tx.set(prodRef, {
      outputBarcode: d.outputBarcode,
      outputName: output.name,
      outputUnit: output.unit,
      outputQty: d.outputQty,
      inputs: lines,
      totalCost,
      unitCost: r2(totalCost / d.outputQty),
      productionDate: d.productionDate,
      expiryDate: d.expiryDate,
      notes: d.notes,
      createdAt: Timestamp.now(),
      createdBy: d.createdBy,
    });

    for (let i = 0; i < inputRefs.length; i++) {
      const item = inSnaps[i].data() as ItemDoc;
      tx.update(inputRefs[i], {
        totalOut: (item.totalOut ?? 0) + d.inputs[i].qty,
        totalInValue: Math.max(0, r2((item.totalInValue ?? 0) - lines[i].totalCost)),
      });
    }
    tx.update(outputRef, {
      totalIn: (output.totalIn ?? 0) + d.outputQty,
      totalInValue: r2((output.totalInValue ?? 0) + totalCost),
      productionDate: d.productionDate,
      expiryDate: d.expiryDate,
      /* يُضمّ لأقسامه هنا لا في خطوة لاحقة تُنسى — الاتحاد لا الاستبدال
         حتى لا يفقد المنتج قسماً ضُمّ إليه في إنتاج سابق */
      salesSections: [...new Set([...(output.salesSections ?? []), ...sections])],
    });
  });
  return { id: prodRef.id };
}

/** تعديل عملية إنتاج قائمة: يعكس أثرها القديم على المخزون ثم يطبّق
 *  الجديد، ذرّياً في معاملة واحدة — لا حذفاً ثم إنشاءً، فلا تنكشف
 *  حالة وسيطة ولا يفلت خطأ منتصف الطريق.
 *
 *  الصنف المُنتَج ثابت لا يُغيَّر: تصحيح كمياته وتاريخه ومدخلاته وارد،
 *  أمّا تحويل الإنتاج إلى صنف آخر فمعناه حذف هذه العملية وتسجيل غيرها.
 *  ولذلك أقسام البيع لا تُمسّ هنا أيضاً — لم تُخزَّن على العملية أصلاً
 *  بل اتُّحدت مرة على الصنف وقت الإنشاء، فلا سبيل لمعرفة أي جزء منها
 *  يخصّ هذه العملية بعينها ليُعاد أو يُستبدل.
 *
 *  كل مادة خام تُعاد إلى رصيدها ومتوسطها كأن هذه العملية لم تكن، ثم
 *  تُستهلك المدخلات الجديدة من ذلك الرصيد "المُعاد" — فتعديل كمية من
 *  40 إلى 45 لا يُرفض بحجة أن الـ40 الأولى محجوزة أصلاً بهذه العملية
 *  نفسها. ومادة أُزيلت من القائمة تُعاد فقط بلا استهلاك جديد. */
export async function svcUpdateProduction(
  db: Firestore,
  id: string,
  d: {
    outputQty: number;
    inputs: { barcode: string; qty: number }[];
    productionDate: string; expiryDate: string | null; notes: string | null;
  }
) {
  if (d.inputs.length === 0) throw new ApiError("أضف مادة خام واحدة على الأقل");
  const seen = new Set<string>();
  for (const i of d.inputs) {
    if (seen.has(i.barcode)) throw new ApiError("تكرّرت مادة خام في المدخلات");
    seen.add(i.barcode);
  }

  const prodRef = db.collection("cost_production").doc(id);

  await db.runTransaction(async (tx) => {
    const pSnap = await tx.get(prodRef);
    if (!pSnap.exists) throw new ApiError("عملية الإنتاج غير موجودة", 404);
    const p = pSnap.data() as {
      outputBarcode: string; outputQty: number; totalCost: number;
      inputs: { barcode: string; qty: number; totalCost: number }[];
    };
    if (d.inputs.some((i) => i.barcode === p.outputBarcode)) {
      throw new ApiError("لا يمكن أن يكون الصنف المُنتَج أحد مدخلاته");
    }

    const outputRef = db.collection("cost_items").doc(p.outputBarcode);

    // اتحاد مراجع المدخلات القديمة والجديدة — صنف ظهر في الاثنين يُقرأ مرة واحدة
    const refByBarcode = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const i of p.inputs) refByBarcode.set(i.barcode, db.collection("cost_items").doc(i.barcode));
    for (const i of d.inputs) refByBarcode.set(i.barcode, db.collection("cost_items").doc(i.barcode));
    const barcodes = [...refByBarcode.keys()];

    const [outSnap, ...inSnaps] = await Promise.all([
      tx.get(outputRef),
      ...barcodes.map((b) => tx.get(refByBarcode.get(b)!)),
    ]);
    const snapByBarcode = new Map(barcodes.map((b, i) => [b, inSnaps[i]]));

    if (!outSnap.exists) throw new ApiError("الصنف المُنتَج غير مسجّل");
    const output = outSnap.data() as ItemDoc;

    // ١) عكس القديم على الصنف المُنتَج
    const outBalance = balanceOf(output);
    if (p.outputQty > outBalance) {
      throw new ApiError(
        `لا يمكن تعديل هذا الإنتاج — صُرف من المُنتَج ما يجعل المتبقي ${outBalance} ${output.unit} فقط`
      );
    }
    let outTotalIn = (output.totalIn ?? 0) - p.outputQty;
    let outTotalInValue = Math.max(0, r2((output.totalInValue ?? 0) - p.totalCost));

    // ٢) عكس القديم لكل مدخل — أرقام محلية بلا كتابة فعلية بعد
    const state = new Map<string, { totalIn: number; totalOut: number; totalInValue: number; name: string; unit: string }>();
    for (const barcode of barcodes) {
      const snap = snapByBarcode.get(barcode)!;
      if (!snap.exists) continue; // صنف حُذف من التكاليف — لا شيء يُعاد إليه
      const item = snap.data() as ItemDoc;
      let totalOut = item.totalOut ?? 0;
      let totalInValue = item.totalInValue ?? 0;
      const old = p.inputs.find((i) => i.barcode === barcode);
      if (old) {
        totalOut = Math.max(0, totalOut - old.qty);
        totalInValue = r2(totalInValue + old.totalCost);
      }
      state.set(barcode, { totalIn: item.totalIn ?? 0, totalOut, totalInValue, name: item.name, unit: item.unit });
    }

    // ٣) تطبيق الجديد: استهلاك من الرصيد "المُعاد" أعلاه
    const newLines: { barcode: string; itemName: string; unit: string; qty: number; unitCost: number; totalCost: number }[] = [];
    let newTotalCost = 0;
    for (const inp of d.inputs) {
      const s = state.get(inp.barcode);
      if (!s) throw new ApiError("إحدى المواد الخام غير مسجّلة");
      const synthetic: ItemDoc = { name: s.name, unit: s.unit, totalIn: s.totalIn, totalOut: s.totalOut, totalInValue: s.totalInValue };
      const balance = balanceOf(synthetic);
      if (inp.qty > balance) {
        throw new ApiError(`الكمية المتوفرة من "${s.name}" غير كافية (المتوفر: ${balance} ${s.unit})`);
      }
      const unitCost = avgOf(synthetic);
      const lineCost = r2(unitCost * inp.qty);
      newTotalCost += lineCost;
      newLines.push({ barcode: inp.barcode, itemName: s.name, unit: s.unit, qty: inp.qty, unitCost: r2(unitCost), totalCost: lineCost });
      state.set(inp.barcode, { ...s, totalOut: r2(s.totalOut + inp.qty), totalInValue: Math.max(0, r2(s.totalInValue - lineCost)) });
    }
    newTotalCost = r2(newTotalCost);

    for (const barcode of barcodes) {
      const s = state.get(barcode);
      if (!s) continue;
      tx.update(refByBarcode.get(barcode)!, { totalOut: s.totalOut, totalInValue: s.totalInValue });
    }

    outTotalIn = r2(outTotalIn + d.outputQty);
    outTotalInValue = r2(outTotalInValue + newTotalCost);
    tx.update(outputRef, { totalIn: outTotalIn, totalInValue: outTotalInValue });

    tx.update(prodRef, {
      outputQty: d.outputQty,
      inputs: newLines,
      totalCost: newTotalCost,
      unitCost: d.outputQty > 0 ? r2(newTotalCost / d.outputQty) : 0,
      productionDate: d.productionDate,
      expiryDate: d.expiryDate,
      notes: d.notes,
    });
  });
}

export async function svcDeleteProduction(db: Firestore, id: string) {
  const prodRef = db.collection("cost_production").doc(id);
  await db.runTransaction(async (tx) => {
    const pSnap = await tx.get(prodRef);
    if (!pSnap.exists) throw new ApiError("عملية الإنتاج غير موجودة", 404);
    const p = pSnap.data() as {
      outputBarcode: string; outputQty: number; totalCost: number;
      inputs: { barcode: string; qty: number; totalCost: number }[];
    };

    const outputRef = db.collection("cost_items").doc(p.outputBarcode);
    const inputRefs = p.inputs.map((i) => db.collection("cost_items").doc(i.barcode));
    const outSnap = await tx.get(outputRef);
    const inSnaps = await Promise.all(inputRefs.map((r) => tx.get(r)));

    if (outSnap.exists) {
      const o = outSnap.data() as ItemDoc;
      const balance = balanceOf(o);
      if (p.outputQty > balance) {
        throw new ApiError(
          `لا يمكن حذف هذا الإنتاج — صُرف من المُنتَج ما يجعل المتبقي ${balance} ${o.unit} فقط`
        );
      }
      tx.update(outputRef, {
        totalIn: (o.totalIn ?? 0) - p.outputQty,
        totalInValue: Math.max(0, r2((o.totalInValue ?? 0) - p.totalCost)),
      });
    }
    for (let i = 0; i < inputRefs.length; i++) {
      if (!inSnaps[i].exists) continue;
      const item = inSnaps[i].data() as ItemDoc;
      tx.update(inputRefs[i], {
        totalOut: Math.max(0, (item.totalOut ?? 0) - p.inputs[i].qty),
        totalInValue: r2((item.totalInValue ?? 0) + p.inputs[i].totalCost),
      });
    }
    tx.delete(prodRef);
  });
}

/* ── التالف ────────────────────────────────────────────────── */

export async function svcAddStoreDamage(
  db: Firestore,
  d: { itemBarcode: string; quantity: number; reason: string; damageDate: string; createdBy: string }
) {
  const itemRef = db.collection("cost_items").doc(d.itemBarcode);
  const damageRef = db.collection("cost_damage").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ApiError("الصنف غير مسجّل");
    const item = snap.data() as ItemDoc;
    const balance = balanceOf(item);
    if (d.quantity > balance) {
      throw new ApiError(`الكمية المتوفرة من "${item.name}" غير كافية (المتوفر: ${balance} ${item.unit})`);
    }
    const unitCost = avgOf(item);
    const totalCost = r2(unitCost * d.quantity);

    tx.set(damageRef, {
      itemBarcode: d.itemBarcode,
      itemName: item.name,
      unit: item.unit,
      quantity: d.quantity,
      unitCost: r2(unitCost),
      totalCost,
      reason: d.reason,
      source: "store",
      outgoingId: null,
      concertId: null,
      concertName: null,
      clientName: null,
      damageDate: d.damageDate,
      createdAt: Timestamp.now(),
      createdBy: d.createdBy,
    });
    tx.update(itemRef, {
      totalOut: (item.totalOut ?? 0) + d.quantity,
      totalInValue: Math.max(0, r2((item.totalInValue ?? 0) - totalCost)),
    });
  });
  return { id: damageRef.id };
}

export async function svcDeleteDamage(db: Firestore, id: string) {
  const damageRef = db.collection("cost_damage").doc(id);
  await db.runTransaction(async (tx) => {
    const dSnap = await tx.get(damageRef);
    if (!dSnap.exists) throw new ApiError("القيد غير موجود", 404);
    const e = dSnap.data() as {
      itemBarcode: string; quantity: number; totalCost: number;
      source: "store" | "outgoing"; outgoingId?: string | null;
    };

    const itemRef = db.collection("cost_items").doc(e.itemBarcode);
    const outRef = e.outgoingId ? db.collection("cost_outgoing").doc(e.outgoingId) : null;
    const iSnap = await tx.get(itemRef);
    const oSnap = outRef ? await tx.get(outRef) : null;

    // تالف المستودع خرج بقيد التالف نفسه فيعود؛ وتالف الصرف خرج مع
    // الصرف فلا يعود للمخزون بل تعود قيمته إلى تكلفة الحفلة
    if (e.source === "store" && iSnap.exists) {
      const item = iSnap.data() as ItemDoc;
      tx.update(itemRef, {
        totalOut: Math.max(0, (item.totalOut ?? 0) - e.quantity),
        totalInValue: r2((item.totalInValue ?? 0) + e.totalCost),
      });
    }
    if (outRef && oSnap?.exists) {
      const o = oSnap.data() as { quantity: number; unitPrice: number; returnedQty?: number; damagedQty?: number };
      const newDamaged = Math.max(0, (o.damagedQty ?? 0) - e.quantity);
      const consumed = o.quantity - (o.returnedQty ?? 0) - newDamaged;
      tx.update(outRef, { damagedQty: newDamaged, totalCost: r2(consumed * o.unitPrice) });
    }
    tx.delete(damageRef);
  });
}

/* ── أصناف التكاليف ────────────────────────────────────────── */

export async function svcCreateItem(
  db: Firestore,
  d: {
    name: string; unit: string; mode: "generate" | "supplier"; barcode?: string;
    productionDate: string | null; expiryDate: string | null; createdBy: string;
  }
) {
  const base = {
    name: d.name,
    unit: d.unit,
    totalIn: 0,
    totalOut: 0,
    totalInValue: 0,
    productionDate: d.productionDate,
    expiryDate: d.expiryDate,
    createdAt: Timestamp.now(),
    createdBy: d.createdBy,
  };

  if (d.mode === "supplier") {
    const code = (d.barcode ?? "").trim();
    if (!code) throw new ApiError("أدخل رقم الباركود");
    const ref = db.collection("cost_items").doc(code);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw new ApiError("هذا الباركود مسجّل مسبقاً لصنف آخر");
      tx.set(ref, { ...base, barcodeSource: "supplier" });
    });
    return { id: code };
  }

  // الباركود الداخلي يُولَّد ويُسجَّل في معاملة واحدة فلا يبقى عدّاد يتيم
  const counterRef = db.collection("counters").doc("cost_items");
  let barcode = "";
  await db.runTransaction(async (tx) => {
    const cSnap = await tx.get(counterRef);
    const next = (cSnap.data()?.lastNumber ?? 0) + 1;
    barcode = "FRJ" + String(next).padStart(6, "0");
    const ref = db.collection("cost_items").doc(barcode);
    if ((await tx.get(ref)).exists) throw new ApiError("تعارض في توليد الباركود، حاول مرة أخرى");
    tx.set(counterRef, { lastNumber: next });
    tx.set(ref, { ...base, barcodeSource: "generated" });
  });
  return { id: barcode };
}

export async function svcUpdateItem(
  db: Firestore,
  barcode: string,
  d: {
    name?: string; unit?: string;
    productionDate?: string | null; expiryDate?: string | null;
    /** الخلطة القياسية — تُحفظ من صفحة الإنتاج */
    productionRecipe?: unknown;
    /** سعر البيع شامل الضريبة لكل قسم — معرّف القسم ← السعر */
    sectionPrices?: unknown;
  }
) {
  const ref = db.collection("cost_items").doc(barcode);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError("الصنف غير موجود", 404);
  const item = snap.data() as ItemDoc & { salesSections?: string[] };

  // الوحدة تُقفل بعد أول وارد: تغييرها يجعل كل وصفة خاطئة بصمت
  if (d.unit && (item.totalIn ?? 0) > 0 && item.unit !== d.unit) {
    throw new ApiError(
      `لا يمكن تغيير وحدة "${item.name}" بعد تسجيل وارد عليه — الوصفات والأرصدة محسوبة بالوحدة الحالية (${item.unit})`
    );
  }
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.unit !== undefined) patch.unit = d.unit;
  if (d.productionDate !== undefined) patch.productionDate = d.productionDate;
  if (d.expiryDate !== undefined) patch.expiryDate = d.expiryDate;
  if (d.productionRecipe !== undefined) patch.productionRecipe = d.productionRecipe;
  if (d.sectionPrices !== undefined) {
    if (typeof d.sectionPrices !== "object" || d.sectionPrices === null || Array.isArray(d.sectionPrices)) {
      throw new ApiError("صيغة الأسعار غير صحيحة");
    }
    const assigned = new Set(item.salesSections ?? []);
    const clean: Record<string, number> = {};
    for (const [sectionId, price] of Object.entries(d.sectionPrices as Record<string, unknown>)) {
      if (!assigned.has(sectionId)) throw new ApiError("لا يمكن تسعير قسم لا يضمّ هذا الصنف");
      const n = Number(price);
      if (!Number.isFinite(n) || n < 0) throw new ApiError("السعر يجب أن يكون رقماً موجباً");
      clean[sectionId] = Math.round(n * 100) / 100;
    }
    patch.sectionPrices = clean;
  }
  await ref.update(patch);
}

export async function svcDeleteItem(db: Firestore, barcode: string) {
  const [inc, out, dmg, prod, food] = await Promise.all([
    db.collection("cost_incoming").where("itemBarcode", "==", barcode).limit(1).get(),
    db.collection("cost_outgoing").where("itemBarcode", "==", barcode).limit(1).get(),
    db.collection("cost_damage").where("itemBarcode", "==", barcode).limit(1).get(),
    db.collection("cost_production").get(),
    db.collection("food_categories").get(),
  ]);

  const parts: string[] = [];
  if (!inc.empty) parts.push("عمليات وارد");
  if (!out.empty) parts.push("عمليات منصرف");
  if (!dmg.empty) parts.push("قيود تالف");

  const usedInProduction = prod.docs.some((d) => {
    const p = d.data() as { outputBarcode: string; inputs?: { barcode: string }[] };
    return p.outputBarcode === barcode || (p.inputs ?? []).some((i) => i.barcode === barcode);
  });
  if (usedInProduction) parts.push("عمليات إنتاج");

  const recipes: string[] = [];
  for (const d of food.docs) {
    const c = d.data() as { name: string; optionDefs?: { name: string; recipe?: { barcode: string }[]; costItemBarcode?: string | null }[] };
    for (const def of c.optionDefs ?? []) {
      if ((def.recipe ?? []).some((l) => l.barcode === barcode) || def.costItemBarcode === barcode) {
        recipes.push(`${c.name} / ${def.name}`);
      }
    }
  }
  if (recipes.length) parts.push(`وصفات: ${recipes.slice(0, 3).join("، ")}${recipes.length > 3 ? " وغيرها" : ""}`);

  if (parts.length) {
    throw new ApiError(`لا يمكن حذف هذا الصنف — مرتبط بـ ${parts.join(" · ")}. احذف ما يشير إليه أولاً أو أبقِه كما هو.`);
  }
  await db.collection("cost_items").doc(barcode).delete();
}
