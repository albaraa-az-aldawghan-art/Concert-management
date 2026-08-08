/* أقسام البيع: إنشاء قسم تحت قناة (مطعم · حفلات · تعاقدات). */

import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str } from "@/lib/server/guard";
import { svcCreateSection } from "@/lib/server/sales-core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    // الهيكل مملوك للتكاليف: من يدير الأصناف يدير أقسام بيعها
    require_(caller, "costs", "item_add", "إدارة أقسام البيع");
    return svcCreateSection(caller.db, {
      channel: str(body.channel, "قناة البيع"),
      name: str(body.name, "اسم القسم", { max: 60 }),
      createdBy: caller.uid,
    });
  });
}
