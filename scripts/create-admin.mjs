import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaN6iqL6tvF_VOy2Hre_l2Pr_pLogjRnU",
  authDomain: "concert-management-a4fea.firebaseapp.com",
  projectId: "concert-management-a4fea",
  storageBucket: "concert-management-a4fea.firebasestorage.app",
  messagingSenderId: "629024744808",
  appId: "1:629024744808:web:e628548930aeafceab62dd",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = "admin@concerts.sa";
const PASSWORD = "Admin@2025";

async function createAdmin() {
  try {
    console.log("⏳ جارٍ إنشاء حساب المدير...");

    const credential = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = credential.user.uid;

    await setDoc(doc(db, "users", uid), {
      uid,
      name: "المدير",
      email: EMAIL,
      role: "admin",
      createdAt: Timestamp.now(),
      createdBy: "system",
    });

    console.log("✅ تم إنشاء حساب المدير بنجاح!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📧 الإيميل   : ${EMAIL}`);
    console.log(`🔑 كلمة المرور: ${PASSWORD}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("افتح: http://localhost:3000/login");
    process.exit(0);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      console.log("⚠️  الحساب موجود مسبقاً.");
      console.log(`📧 الإيميل   : ${EMAIL}`);
      console.log(`🔑 كلمة المرور: ${PASSWORD}`);
    } else {
      console.error("❌ خطأ:", err.message);
      console.log("\n💡 تأكد من تفعيل Email/Password في Firebase Console:");
      console.log("   Authentication → Sign-in method → Email/Password → Enable");
    }
    process.exit(0);
  }
}

createAdmin();
