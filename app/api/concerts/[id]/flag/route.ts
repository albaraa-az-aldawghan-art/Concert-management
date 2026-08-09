import { NextRequest } from "next/server";
import { requireCaller, handle, str, ApiError } from "@/lib/server/guard";
import { svcSetConcertFlag, svcClearConcertFlag, svcSetLocation } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** خطوات التنفيذ (استلام · بدء · إرجاع · تسليم للموارد) والموقع.
 *
 *  ثلاثة يملكونها: المشرف صاحب الخطوة بصلاحيتها المفردة، ومن يملك
 *  «تنفيذ أي خطوة» من صفحة الحفلات، والأدمن. والتراجع صلاحية مستقلة
 *  لأنه يُلغي عملاً مسجّلاً باسم غيرك. */
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
    const undo = body.undo === true;
    const key = !undo && body.location ? "location" : String(body.flag ?? "");

    if (undo) {
      /* التراجع لا يُشتقّ من صلاحية التنفيذ: من يستطيع تسجيل خطوته
         ليس بالضرورة من يُسمح له بمحو خطوة سُجّلت */
      if (!caller.feat("concerts", "wf_undo")) {
        throw new ApiError("لا تملك صلاحية التراجع عن خطوات الحفلة", 403);
      }
      await svcClearConcertFlag(caller.db, id, str(body.flag, "الخطوة"), caller.uid);
      return;
    }

    /* دور المشرف صار مستنداً تُعدَّل صلاحياته، فلا يُستثنى بالاسم:
       نزعُ خطوة من الدور يجب أن يمنعها فعلاً، وإلا كان الكتالوج زينة. */
    const allowed =
      caller.feat("supervisor", FEATURE_BY_FLAG[key] ?? "") ||
      caller.feat("concerts", "wf_run") ||
      (key === "location" && caller.feat("concerts", "edit_location"));
    if (!allowed) throw new ApiError("لا تملك صلاحية تحديث خطوات الحفلة", 403);

    if (body.location) {
      await svcSetLocation(caller.db, id, body.location, caller.uid);
      return;
    }
    await svcSetConcertFlag(caller.db, id, str(body.flag, "الخطوة"), caller.uid);
  });
}
