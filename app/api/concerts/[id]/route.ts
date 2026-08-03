import { NextRequest } from "next/server";
import { requireCaller, require_, handle } from "@/lib/server/guard";
import { svcUpdateConcert, svcDeleteConcert } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** تعديل حقول الحفلة المسموح بها فقط — القائمة في concerts-core */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    require_(caller, "concerts", "edit", "تعديل الحفلات");
    const { id } = await params;
    await svcUpdateConcert(caller.db, id, body);
  });
}

/** حذف الحفلة — يُفرج عن مواردها المحجوزة أولاً */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const caller = await requireCaller(req);
    require_(caller, "concerts", "delete", "حذف الحفلات");
    const { id } = await params;
    await svcDeleteConcert(caller.db, id);
  });
}
