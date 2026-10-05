import { NextRequest, NextResponse } from "next/server";
import { requireCaller, ApiError, withActivityResponse } from "@/lib/server/guard";
import { buildCostItemsWorkbook, COST_ITEMS_EXPORT_META } from "@/lib/cost-items-export";
import type { CostIncoming, CostItem, SalesSection } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Scope = "raw" | "products" | "recipes";

async function download(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    if (!caller.isAdmin && !caller.feat("costs", "export")) {
      throw new ApiError("لا تملك صلاحية تصدير التكاليف", 403);
    }
    const params = new URL(req.url).searchParams;
    const scope = params.get("scope") as Scope;
    if (!COST_ITEMS_EXPORT_META[scope]) throw new ApiError("نوع التصدير غير صحيح");

    // هذا المسار للروابط المباشرة والتوافق القديم. الواجهة الحديثة تبني الملف
    // من البيانات المحمّلة محلياً كي لا تكرر قراءات Firestore.
    const [itemSnap, incomingSnap, sectionSnap] = await Promise.all([
      caller.db.collection("cost_items").get(),
      scope === "raw" ? caller.db.collection("cost_incoming").get() : Promise.resolve(null),
      scope === "products" ? caller.db.collection("sales_sections").get() : Promise.resolve(null),
    ]);
    const items = itemSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as CostItem));
    const incoming = incomingSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as CostIncoming)) ?? [];
    const sections = sectionSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as SalesSection)) ?? [];
    const workbook = await buildCostItemsWorkbook({
      scope,
      selectedColumns: params.get("cols"),
      items,
      incoming,
      sections,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const meta = COST_ITEMS_EXPORT_META[scope];
    return new NextResponse(buffer as ArrayBuffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cost-items-${scope}.xlsx"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
      "Cache-Control": "no-store, max-age=0",
    } });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذّر التصدير" }, { status });
  }
}

export async function GET(...args: Parameters<typeof download>) {
  return withActivityResponse(() => download(...args));
}
