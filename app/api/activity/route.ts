import { NextRequest } from "next/server";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, DocumentData } from "firebase-admin/firestore";
import { ApiError, handle, requireCaller, requirePage, str } from "@/lib/server/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requirePage(caller, "activity", "عرض سجل النشاطات");
    const params = req.nextUrl.searchParams;
    const size = Number(params.get("limit") ?? 30);
    if (!Number.isInteger(size) || size < 1 || size > 100) throw new ApiError("عدد السجلات غير صحيح");
    let query = caller.db.collection("activity_logs").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
    for (const [key, operator] of [["from", ">="], ["to", "<="]] as const) {
      const value = params.get(key);
      if (value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) throw new ApiError("التاريخ غير صحيح");
        query = query.where("createdAt", operator, Timestamp.fromDate(date));
      }
    }
    const cursor = params.get("cursor");
    if (cursor) {
      if (!/^[\w-]{1,150}$/.test(cursor)) throw new ApiError("مؤشر الصفحة غير صحيح");
      const snap = await caller.db.collection("activity_logs").doc(cursor).get();
      if (!snap.exists) throw new ApiError("مؤشر الصفحة غير موجود");
      query = query.startAfter(snap);
    }
    const term = (params.get("q") ?? "").trim().toLocaleLowerCase("ar").slice(0, 100);
    const status = params.get("status");
    if (status && !["pending", "success", "failed", "interaction"].includes(status)) throw new ApiError("نوع النشاط غير صحيح");
    if (params.get("from") && params.get("to") && new Date(params.get("from")!).getTime() > new Date(params.get("to")!).getTime()) throw new ApiError("ترتيب التواريخ غير صحيح");
    const entries = [];
    let scanned = 0;
    let nextCursor: string | null = null;
    // Bounded scans avoid composite indexes for arbitrary search combinations.
    while (entries.length < size && scanned < 1000) {
      const batchSize = Math.min(term || status ? 100 : size - entries.length, 1000 - scanned);
      const snap = await query.limit(batchSize).get();
      if (snap.empty) { nextCursor = null; break; }
      for (const doc of snap.docs) {
        scanned++;
        nextCursor = doc.id;
        const data = doc.data();
        if ((!status || data.status === status) && (!term ||
          [data.actorName, data.actorEmail, data.actorId, data.action, data.path, data.targetId].some((v) => String(v ?? "").toLocaleLowerCase("ar").includes(term)))) {
          entries.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate().toISOString() ?? "" });
        }
        query = query.startAfter(doc);
        if (entries.length === size) break;
      }
      if (snap.size < batchSize && entries.length < size) { nextCursor = null; break; }
    }
    return { entries, nextCursor };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    const body = await req.json();
    if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 30) throw new ApiError("قائمة النشاطات غير صحيحة");
    const actor = (await caller.db.collection("users").doc(caller.uid).get()).data()!;
    const pending: { ref: DocumentReference; data: DocumentData }[] = [];
    for (const event of body.events) {
      const action = str(event.action, "الإجراء", { max: 160 });
      const path = str(event.path, "الصفحة", { max: 300 }).split("?")[0];
      if (!path.startsWith("/") || path.startsWith("//")) throw new ApiError("الصفحة غير صحيحة");
      const id = str(event.id, "المعرّف", { max: 80 });
      if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new ApiError("المعرّف غير صحيح");
      // Browser reports are explicitly marked as interactions, never success.
      pending.push({ ref: caller.db.collection("activity_logs").doc(`${caller.uid}_${id}`), data: {
        actorId: caller.uid, actorName: actor.name ?? "", actorEmail: actor.email ?? "",
        action, path, targetId: "", status: "interaction", source: "browser",
        createdAt: FieldValue.serverTimestamp(),
      } });
    }
    await caller.db.runTransaction(async (tx) => {
      const unique = [...new Map(pending.map((entry) => [entry.ref.id, entry])).values()];
      const snapshots = await tx.getAll(...unique.map((entry) => entry.ref));
      unique.forEach((entry, index) => {
        if (!snapshots[index].exists) tx.create(entry.ref, entry.data);
      });
    });
    return { ok: true };
  });
}
