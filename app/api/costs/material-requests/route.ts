import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, requirePage } from "@/lib/server/guard";
import { createMaterialRequest, editMaterialRequest, cancelMaterialRequest, receiveMaterialRequest, postMaterialInvoice, voidMaterialReceipt, setMaterialPolicy, listMaterialRequests, listMaterialChoices, getMaterialRequest, materialId } from "@/lib/server/material-requests-core";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req); requirePage(caller, "costs", "طلبات المواد");
    const p = req.nextUrl.searchParams;
    const can = (key: string) => caller.feat("costs", key);
    if (p.get("suppliers") === "1") {
      if (!can("mat_receive") && !can("mat_invoice")) throw new ApiError("لا تملك صلاحية اختيار المورد", 403);
      const saved = await caller.db.collection("cost_settings").doc("suppliers").get();
      return { names: Array.isArray(saved.data()?.names) ? saved.data()!.names : [] };
    }
    if (p.get("choices") === "1") {
      if (!["mat_view","mat_view_all","mat_create","mat_receive","mat_auto"].some(can)) throw new ApiError("لا تملك صلاحية عرض مواد الطلب", 403);
      return { items: await listMaterialChoices(caller.db) };
    }
    if (!["mat_view","mat_view_all","mat_create"].some(can)) throw new ApiError("لا تملك صلاحية عرض طلبات المواد", 403);
    const all = can("mat_view_all");
    if (p.has("id")) return getMaterialRequest(caller.db, caller.uid, all, can("mat_price"), materialId(p.get("id")), p.get("receiptCursor") ?? undefined);
    return listMaterialRequests(caller.db, caller.uid, all, { state: p.get("state") ?? undefined, q: p.get("q") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, cursor: p.get("cursor") ?? undefined });
  });
}
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body); requirePage(caller, "costs", "طلبات المواد");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("بيانات غير صحيحة");
    const features: Record<string, string> = { create: "mat_create", edit: "mat_edit", cancel: "mat_cancel", receive: "mat_receive", invoice: "mat_invoice", void: "mat_correct", policy: "mat_auto" };
    if (!features[body.action]) throw new ApiError("إجراء غير معروف");
    require_(caller, "costs", features[body.action], "تنفيذ هذا الإجراء على طلبات المواد");
    const all = caller.feat("costs", "mat_view_all");
    switch (body.action) {
      case "create": return createMaterialRequest(caller.db, caller.uid, body.input);
      case "edit": return editMaterialRequest(caller.db, caller.uid, all, body.id, body.input, body.revision);
      case "cancel": return cancelMaterialRequest(caller.db, caller.uid, all, body.id, body.reason);
      case "receive":
        if (body.input?.invoice) require_(caller, "costs", "mat_invoice", "اعتماد فاتورة الاستلام");
        return receiveMaterialRequest(caller.db, caller.uid, all, caller.feat("costs", "mat_overreceive"), body.id, body.input);
      case "invoice": return postMaterialInvoice(caller.db, caller.uid, all, body.id, body.receiptId, body.input);
      case "void": return voidMaterialReceipt(caller.db, caller.uid, all, body.id, body.receiptId, body.reason);
      case "policy": return setMaterialPolicy(caller.db, caller.uid, body.barcode, body.input);
    }
  });
}
