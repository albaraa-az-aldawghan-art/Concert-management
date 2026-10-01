import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, str } from "@/lib/server/guard";
import { deletedRawCategories, renamedRawCategories } from "@/lib/raw-categories";

const MAX_TRANSACTION_ITEMS = 450;

async function changeCategory(req: NextRequest, mode: "rename" | "delete") {
  return handle(async () => {
    const body = mode === "rename" ? await req.json() : undefined;
    const caller = await requireCaller(req, body);
    require_(caller, "costs", "item_config", mode === "rename" ? "تعديل قسم المواد الخام" : "حذف قسم المواد الخام");

    const oldName = mode === "rename"
      ? str(body?.oldName, "اسم القسم", { max: 100 })
      : str(new URL(req.url).searchParams.get("name"), "اسم القسم", { max: 100 });
    const newName = mode === "rename" ? str(body?.newName, "اسم القسم الجديد", { max: 100 }) : null;
    const settingsRef = caller.db.collection("cost_settings").doc("config");
    const itemsQuery = caller.db.collection("cost_items").where("rawCategory", "==", oldName);

    return caller.db.runTransaction(async (transaction) => {
      const settingsSnap = await transaction.get(settingsRef);
      const itemSnap = await transaction.get(itemsQuery);
      if (itemSnap.size > MAX_TRANSACTION_ITEMS) throw new ApiError("القسم يحتوي مواد كثيرة جدًا للتعديل دفعة واحدة");

      const current = settingsSnap.data() ?? {};
      const categories = Array.isArray(current.rawCategories)
        ? current.rawCategories.map(String)
        : [];
      const rawCategories = mode === "rename"
        ? renamedRawCategories(categories, oldName, newName!)
        : deletedRawCategories(categories, oldName);

      itemSnap.docs.forEach((item) => transaction.update(item.ref, { rawCategory: newName }));
      transaction.set(settingsRef, { rawCategories }, { merge: true });
      return { affected: itemSnap.size, rawCategories };
    });
  });
}

export async function PATCH(req: NextRequest) {
  return changeCategory(req, "rename");
}

export async function DELETE(req: NextRequest) {
  return changeCategory(req, "delete");
}
