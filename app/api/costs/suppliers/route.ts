import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { handle, requireCaller, require_, str } from "@/lib/server/guard";
import { purchaseSupplierNames } from "@/lib/purchase-options";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "costs", "in_add", "اختيار الموردين لفاتورة الشراء");
    const [saved, history] = await Promise.all([
      caller.db.collection("cost_settings").doc("suppliers").get(),
      caller.db.collection("cost_incoming").select("supplierName").get(),
    ]);
    return { names: purchaseSupplierNames([
      ...(Array.isArray(saved.data()?.names) ? saved.data()!.names : []),
      ...history.docs.map((doc) => doc.data().supplierName),
    ]) };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "in_add", "إضافة مورد شراء");
    const name = purchaseSupplierNames([str(body.name, "اسم المورد", { max: 150 })])[0];
    await caller.db.collection("cost_settings").doc("suppliers").set({ names: FieldValue.arrayUnion(name) }, { merge: true });
    return { name };
  });
}
