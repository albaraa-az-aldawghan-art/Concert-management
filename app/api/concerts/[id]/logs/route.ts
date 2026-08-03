import { NextRequest } from "next/server";
import { requireCaller, handle, str, optStr } from "@/lib/server/guard";
import { svcAddLog } from "@/lib/server/concerts-core";

export const dynamic = "force-dynamic";

/** سجل تدقيق — يُكتب ولا يُعدَّل ولا يُحذف */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    const { id } = await params;
    return svcAddLog(caller.db, {
      concertId: id,
      description: str(body.description, "الوصف", { max: 500 }),
      field: optStr(body.field) ?? undefined,
      oldValue: optStr(body.oldValue, 500) ?? undefined,
      newValue: optStr(body.newValue, 500) ?? undefined,
      createdBy: caller.uid,
    });
  });
}
