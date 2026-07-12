import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

// Creating users client-side is broken by design: createUserWithEmailAndPassword
// switches the admin's session to the new user, whose Firestore write is then
// denied by the rules — leaving an orphaned Auth account (email taken, no doc,
// login impossible). The Admin SDK avoids both problems entirely.

async function callerHasUsersFeature(db: Firestore, uid: string, feature: string): Promise<boolean> {
  const callerDoc = await db.collection("users").doc(uid).get();
  if (!callerDoc.exists) return false;
  const data = callerDoc.data()!;
  if (data.role === "admin") return true;
  if (data.role === "custom" && data.customRoleId) {
    const roleDoc = await db.collection("custom_roles").doc(data.customRoleId).get();
    const perms = roleDoc.exists ? roleDoc.data()?.permissions?.users : undefined;
    if (Array.isArray(perms)) return perms.includes(feature);
    return perms === "manage"; // legacy format
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role, customRoleId, callerIdToken } = await req.json();

    if (!callerIdToken) {
      return NextResponse.json({ error: "مطلوب رمز المصادقة" }, { status: 401 });
    }
    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: "جميع الحقول مطلوبة" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const decoded = await adminAuth.verifyIdToken(callerIdToken);
    if (!(await callerHasUsersFeature(adminDb, decoded.uid, "create"))) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    // Does this email already have an Auth account?
    let uid: string | null = null;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
    } catch {
      uid = null; // no account — normal creation path
    }

    if (uid) {
      const docSnap = await adminDb.collection("users").doc(uid).get();
      if (docSnap.exists) {
        return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
      }
      // Orphaned Auth account (failed earlier creation) — heal it:
      // reset the password to the one provided and attach the missing doc.
      await adminAuth.updateUser(uid, { password, displayName: name });
    } else {
      const created = await adminAuth.createUser({ email, password, displayName: name });
      uid = created.uid;
    }

    await adminDb.collection("users").doc(uid).set({
      uid,
      name,
      email,
      role,
      customRoleId: customRoleId ?? null,
      createdAt: new Date(),
      createdBy: decoded.uid,
    });

    return NextResponse.json({ success: true, uid });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("create-user:", msg);
    if (msg.includes("لم يتم إعداد")) {
      return NextResponse.json({ error: "لم يتم إعداد Firebase Admin SDK" }, { status: 503 });
    }
    if (msg.includes("email-already-exists")) {
      return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
    }
    if (msg.includes("invalid-email")) {
      return NextResponse.json({ error: "البريد الإلكتروني غير صالح" }, { status: 400 });
    }
    return NextResponse.json({ error: "حدث خطأ أثناء الإنشاء" }, { status: 500 });
  }
}
