/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

async function callerHasUsersFeature(db: Firestore, uid: string, feature: string): Promise<boolean> {
  const callerDoc = await db.collection("users").doc(uid).get();
  if (!callerDoc.exists) return false;
  const data = callerDoc.data()!;
  if (data.role === "admin") return true;
  if (data.role === "custom" && data.customRoleId) {
    const roleDoc = await db.collection("custom_roles").doc(data.customRoleId).get();
    const perms = roleDoc.exists ? roleDoc.data()?.permissions?.users : undefined;
    if (Array.isArray(perms)) return perms.includes(feature);
    return perms === "manage";
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { targetUid, callerIdToken } = await req.json();

    if (!callerIdToken) {
      return NextResponse.json({ error: "مطلوب رمز المصادقة" }, { status: 401 });
    }
    if (!targetUid) {
      return NextResponse.json({ error: "مطلوب معرّف المستخدم" }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const decoded = await adminAuth.verifyIdToken(callerIdToken);
    if (!(await callerHasUsersFeature(adminDb, decoded.uid, "delete"))) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (decoded.uid === targetUid) {
      return NextResponse.json({ error: "لا يمكنك حذف حسابك الحالي" }, { status: 400 });
    }

    // Remove BOTH the Auth account (frees the email) and the Firestore doc
    await adminAuth.deleteUser(targetUid).catch(() => {}); // may already be gone
    await adminDb.collection("users").doc(targetUid).delete();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("delete-user:", msg);
    if (msg.includes("لم يتم إعداد")) {
      return NextResponse.json({ error: "لم يتم إعداد Firebase Admin SDK" }, { status: 503 });
    }
    return NextResponse.json({ error: "حدث خطأ أثناء الحذف" }, { status: 500 });
  }
}
