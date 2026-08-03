import { NextRequest } from "next/server";
import { requireCaller, handle, str, ApiError } from "@/lib/server/guard";
import { svcSetConcertFlag, svcSetLocation } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** خطوات التنفيذ (استلام · بدء · إرجاع · تسليم للموارد) والموقع.
 *  المشرف صاحب الحفلة يملكها، وكذلك من له صلاحية الحفلات. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const { id } = await params;

    // لكل خطوة صلاحيتها في كتالوج المشرف
    const FEATURE_BY_FLAG: Record<string, string> = {
      delivery: "receive_materials",
      executing: "start_executing",
      return: "return_materials",
      toWarehouse: "deliver_warehouse",
      location: "set_location",
    };
    const key = body.location ? "location" : String(body.flag ?? "");
    const allowed =
      caller.isAdmin ||
      caller.role === "supervisor" ||
      caller.feat("concerts", "edit") ||
      caller.feat("supervisor", FEATURE_BY_FLAG[key] ?? "");
    if (!allowed) throw new ApiError("لا تملك صلاحية تحديث خطوات الحفلة", 403);

    if (body.location) {
      await svcSetLocation(caller.db, id, body.location);
      return;
    }
    await svcSetConcertFlag(caller.db, id, str(body.flag, "الخطوة"), caller.uid);
  });
}
