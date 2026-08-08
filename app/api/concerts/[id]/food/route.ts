import { NextRequest } from "next/server";
import { requireCaller, require_, handle, str, optStr } from "@/lib/server/guard";
import { svcAddConcertFood } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** إضافة صنف أكل للحفلة */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "food_add", "إضافة أصناف الأكل");
    const { id } = await params;
    return svcAddConcertFood(caller.db, {
      concertId: id,
      categoryId: str(body.categoryId, "القسم"),
      categoryName: str(body.categoryName, "اسم القسم"),
      selectedOption: optStr(body.selectedOption) ?? "",
      quantity: body.quantity != null ? Number(body.quantity) : null,
      notes: optStr(body.notes, 500),
      createdBy: caller.uid,
    });
  });
}
