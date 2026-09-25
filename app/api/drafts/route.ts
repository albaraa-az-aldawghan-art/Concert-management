import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { ApiError, handle, requireCaller, requirePage, str } from "@/lib/server/guard";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    requirePage(caller, "concerts", "حفظ مسودات الحفلات");
    const id = body.id == null ? null : str(body.id, "معرّف المسودة");
    if (id?.includes("/")) throw new ApiError("معرّف غير صحيح");
    const data = body.data;
    if (!data || typeof data !== "object" || !data.form) throw new ApiError("المسودة غير صحيحة");
    const allowed = ["form", "hallCostType", "hallCostValue", "hallCostDate", "hallCostRecipient", "location", "itemCheck", "foodCheck", "foodMetaLite", "paymentEntries", "paymentForm", "invoice", "activeItemType", "initialExpenses"];
    const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
    const ref = id ? caller.db.collection("concert_drafts").doc(id) : caller.db.collection("concert_drafts").doc();
    const actor = (await caller.db.collection("users").doc(caller.uid).get()).data()!;
    if (id) await ref.update({ ...clean, updatedAt: FieldValue.serverTimestamp() });
    else await ref.create({ ...clean, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: caller.uid, createdByName: actor.name ?? "" });
    return { id: ref.id };
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requirePage(caller, "concerts", "حذف مسودات الحفلات");
    const id = str(req.nextUrl.searchParams.get("id"), "معرّف المسودة");
    if (id.includes("/")) throw new ApiError("معرّف غير صحيح");
    await caller.db.collection("concert_drafts").doc(id).delete();
    return { id };
  });
}
