/* التحقّق من طالب التصدير: من داخل التطبيق برمز الجلسة، أو من إكسل
   بمفتاح في الرابط. الأول يحترم الصلاحيات، والثاني مفتاح أنشأه المدير. */

import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireCaller, ApiError } from "@/lib/server/guard";
import { verifyExportKey } from "@/lib/server/export-keys";
import type { Firestore } from "firebase-admin/firestore";
import type { PermissionPage } from "@/types";

export async function authorizeExport(
  req: NextRequest,
  page: PermissionPage,
  label: string
): Promise<Firestore> {
  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    const db = getAdminDb();
    await verifyExportKey(db, key);
    return db;
  }
  const caller = await requireCaller(req);
  // التصدير قراءة موسّعة: من يملك الصفحة يملك تصديرها
  if (!caller.isAdmin && !caller.feat(page, "export") && !caller.feat(page, "edit")) {
    throw new ApiError(`لا تملك صلاحية تصدير ${label}`, 403);
  }
  return caller.db;
}

/** السنة المطلوبة — الحالية إن لم تُذكر، وتُرفض القيم غير المعقولة */
export function yearFrom(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get("year");
  const y = raw ? parseInt(raw, 10) : new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2000 || y > 2100) throw new ApiError("سنة غير صحيحة");
  return y;
}
