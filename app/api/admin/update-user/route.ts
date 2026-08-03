/* مسار خادم (API): يتحقّق من الهوية والصلاحية ثم ينفّذ العملية على قاعدة البيانات. */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { targetUid, newPassword, newName, callerIdToken } = await req.json();

    if (!callerIdToken) {
      return NextResponse.json({ error: "مطلوب رمز المصادقة" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Verify caller token
    const decoded = await adminAuth.verifyIdToken(callerIdToken);

    // Verify caller is admin in Firestore
    const callerDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    if (!targetUid) {
      return NextResponse.json({ error: "مطلوب معرّف المستخدم" }, { status: 400 });
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
      }
      await adminAuth.updateUser(targetUid, { password: newPassword });
    }

    if (newName) {
      await adminDb.collection("users").doc(targetUid).update({ name: newName });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("update-user:", msg);
    if (msg.includes("لم يتم إعداد")) {
      return NextResponse.json({ error: "لم يتم إعداد Firebase Admin SDK" }, { status: 503 });
    }
    return NextResponse.json({ error: "حدث خطأ أثناء التحديث" }, { status: 500 });
  }
}
