import { NextRequest } from "next/server";
import { ApiError, handle, requireCaller, require_, num, str } from "@/lib/server/guard";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const { kind } = await params;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("بيانات غير صحيحة");
    if (kind === "costs" || kind === "expenses" || kind === "warehouse") {
      require_(caller, kind === "costs" ? "costs" : kind === "warehouse" ? "warehouse" : "concerts", kind === "costs" ? "item_config" : kind === "warehouse" ? "edit" : "exp_add", "تعديل الإعدادات");
      const fields = kind === "costs" ? ["units", "departments", "rawCategories"] : kind === "warehouse" ? ["categories"] : ["types"];
      for (const key of Object.keys(body)) if (!fields.includes(key)) throw new ApiError("حقل غير مسموح");
      for (const value of Object.values(body)) if (!Array.isArray(value) || value.length > 500) throw new ApiError("قائمة غير صحيحة");
      await caller.db.collection(kind === "costs" ? "cost_settings" : kind === "warehouse" ? "warehouse_settings" : "expense_settings").doc("config").set(body);
    } else if (kind === "global") {
      const features: Record<string, string> = { vatRate: "vat", features: "features", labels: "labels", idleMonths: "idle" };
      if (!Object.keys(body).length) throw new ApiError("لا توجد تغييرات");
      for (const [key, value] of Object.entries(body)) {
        if (!features[key]) throw new ApiError("حقل غير مسموح");
        require_(caller, "settings", features[key], "تعديل إعدادات النظام");
        if (key === "vatRate" && (typeof value !== "number" || num(value, "الضريبة", { min: 0 }) > 100)) throw new ApiError("نسبة الضريبة غير صحيحة");
        if (key === "idleMonths" && (typeof value !== "number" || !Number.isInteger(value) || value <= 0)) throw new ApiError("مدة الخمول غير صحيحة");
        if (key === "features" || key === "labels") {
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("إعدادات غير صحيحة");
          for (const item of Object.values(value)) {
            if (key === "features" && typeof item !== "boolean") throw new ApiError("قيمة ميزة غير صحيحة");
            if (key === "labels") str(item, "المسمى", { max: 100 });
          }
        }
      }
      await caller.db.collection("settings").doc("global").set(body, { merge: true });
    } else throw new ApiError("إعدادات غير معروفة", 404);
  });
}
