import { randomBytes, createHash } from "crypto";
import { Timestamp, Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/guard";

/* ═══════════════════════════════════════════════════════════════
   مفاتيح الرابط الدائم.

   إكسل لا يستطيع إرسال رمز جلسة، فالرابط الذي يُحدَّث منه يحمل مفتاحاً
   في عنوانه. ولأن من يملك الرابط يملك القراءة، فالمفتاح:
   · يُنشئه المدير وحده، ويُعرض مرة واحدة فقط
   · يُخزَّن مُجزّأً (SHA-256) لا نصاً — تسريب قاعدة البيانات لا يكشفه
   · يمكن إبطاله في أي لحظة فيتوقف الرابط فوراً
   · يسجّل آخر استعمال، فتعرف إن كان أحد يستعمله
   ═══════════════════════════════════════════════════════════════ */

const COLLECTION = "export_keys";

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ExportKeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  useCount: number;
  revoked: boolean;
}

/** يُنشئ مفتاحاً جديداً ويُرجع نصّه مرة واحدة — لا يُخزَّن النص أبداً */
export async function createExportKey(db: Firestore, label: string, uid: string) {
  const key = randomBytes(24).toString("base64url"); // 192 بت
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    keyHash: hash(key),
    label: label || "رابط تصدير",
    createdAt: Timestamp.now(),
    createdBy: uid,
    lastUsedAt: null,
    useCount: 0,
    revoked: false,
  });
  return { id: ref.id, key };
}

export async function listExportKeys(db: Firestore): Promise<ExportKeyInfo[]> {
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        label: (x.label as string) ?? "",
        createdAt: (x.createdAt?.seconds ?? 0) * 1000,
        lastUsedAt: x.lastUsedAt ? (x.lastUsedAt.seconds as number) * 1000 : null,
        useCount: (x.useCount as number) ?? 0,
        revoked: !!x.revoked,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeExportKey(db: Firestore, id: string) {
  const ref = db.collection(COLLECTION).doc(id);
  if (!(await ref.get()).exists) throw new ApiError("المفتاح غير موجود", 404);
  await ref.update({ revoked: true });
}

/** يتحقّق من مفتاح قادم في الرابط ويسجّل استعماله. يرمي إن كان
 *  غير موجود أو مُبطَلاً — بنفس الرسالة كي لا يُميَّز أحدهما عن الآخر. */
export async function verifyExportKey(db: Firestore, key: string): Promise<void> {
  const snap = await db.collection(COLLECTION).where("keyHash", "==", hash(key)).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data().revoked) throw new ApiError("رابط التصدير غير صالح أو مُبطَل", 401);

  // تسجيل الاستعمال لا يمنع التصدير إن فشل
  await doc.ref
    .update({ lastUsedAt: Timestamp.now(), useCount: ((doc.data().useCount as number) ?? 0) + 1 })
    .catch(() => {});
}
