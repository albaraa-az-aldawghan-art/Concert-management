import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/* ═══════════════════════════════════════════════════════════════
   إعدادات النظام — مستند واحد settings/global يقرؤه كل مستخدم مرة
   عند الدخول.

   الكتابة دائماً بـ merge: نسبة الضريبة تُحفظ من صفحة الإعدادات
   القديمة، والميزات والمسمّيات من مركز التحكم — فحفظٌ كامل من أحدهما
   يمحو الآخر بصمت.
   ═══════════════════════════════════════════════════════════════ */

/** الميزات التي يمكن إيقافها للجميع دفعة واحدة */
export interface SystemFeatures {
  production: boolean;     // صفحة الإنتاج
  damage: boolean;         // صفحة التالف
  profitability: boolean;  // صفحة ربحية الحفلات
  cameraScan: boolean;     // مسح الباركود بكاميرا الجوّال
  foodRecipes: boolean;    // ربط أصناف الأكل بالتكاليف وعرض المتوفر
}

/** المسمّيات التي تظهر في التنقّل والترويسة */
export interface SystemLabels {
  brandName: string;
  concerts: string;
  warehouse: string;
  costs: string;
  kitchen: string;
  profitability: string;
}

export interface SystemSettings {
  vatRate: number;
  features: SystemFeatures;
  labels: SystemLabels;
}

export const DEFAULT_FEATURES: SystemFeatures = {
  production: true,
  damage: true,
  profitability: true,
  cameraScan: true,
  foodRecipes: true,
};

export const DEFAULT_LABELS: SystemLabels = {
  brandName: "الفريج",
  concerts: "الحفلات",
  warehouse: "الموارد",
  costs: "التكاليف",
  kitchen: "المطبخ",
  profitability: "ربحية الحفلات",
};

export const FEATURE_META: { key: keyof SystemFeatures; label: string; hint: string; href?: string }[] = [
  { key: "production", label: "الإنتاج", hint: "دمج الخامات في خلطة وتوليد باركود لها", href: "/admin/costs/production" },
  { key: "damage", label: "التالف", hint: "تسجيل التالف والمرتجع وخسائرهما", href: "/admin/costs/damage" },
  { key: "profitability", label: "ربحية الحفلات", hint: "صفحة الأرباح والتكاليف لكل حفلة", href: "/admin/profitability" },
  { key: "cameraScan", label: "مسح الباركود بالكاميرا", hint: "بديل قارئ الباركود على الجوّال" },
  { key: "foodRecipes", label: "ربط الأكل بالتكاليف", hint: "عرض المتوفر والتكلفة التقديرية عند اختيار أصناف الأكل" },
];

export async function getSystemSettings(): Promise<SystemSettings> {
  const snap = await getDoc(doc(db, "settings", "global"));
  const d = snap.exists() ? snap.data() : {};
  return {
    vatRate: d.vatRate ?? 15,
    features: { ...DEFAULT_FEATURES, ...(d.features ?? {}) },
    labels: { ...DEFAULT_LABELS, ...(d.labels ?? {}) },
  };
}

export async function updateSystemFeatures(features: SystemFeatures): Promise<void> {
  await setDoc(doc(db, "settings", "global"), { features }, { merge: true });
}

export async function updateSystemLabels(labels: SystemLabels): Promise<void> {
  await setDoc(doc(db, "settings", "global"), { labels }, { merge: true });
}
