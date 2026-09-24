/* تهيئة Firebase في المتصفح (المصادقة وقاعدة البيانات) — نسخة واحدة تُعاد استعمالها. */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
/*
 * نخزن قراءات Firestore في IndexedDB كي تفتح الصفحات من النسخة المحلية فورًا
 * عند العودة إليها، وهو فرق ملحوظ على Safari في الآيفون والاتصالات البطيئة.
 * مدير التبويبات يمنع تعارض الكاش إذا كان النظام مفتوحًا في أكثر من تبويب.
 */
function initializeDatabase() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // إعادة التحميل السريع في التطوير قد تكون هيّأت النسخة بالفعل.
    return getFirestore(app);
  }
}

export const db = initializeDatabase();
export default app;
