/* مفاتيح الرابط الدائم: إنشاء وعرض — للمدير وحده. */

import { NextRequest } from "next/server";
import { requireCaller, requireAdmin, handle, optStr } from "@/lib/server/guard";
import { createExportKey, listExportKeys } from "@/lib/server/export-keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const caller = await requireCaller(req);
    requireAdmin(caller, "إدارة روابط التصدير");
    return { keys: await listExportKeys(caller.db) };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const caller = await requireCaller(req, body);
    requireAdmin(caller, "إنشاء روابط التصدير");
    // النص يُعاد مرة واحدة هنا فقط ولا يُخزَّن — تُخزَّن بصمته
    return createExportKey(caller.db, optStr(body.label, 60) ?? "رابط تصدير", caller.uid);
  });
}
