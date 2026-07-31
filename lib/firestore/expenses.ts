import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ConcertExpense, ExpenseSettings, ExpenseType, ExpenseKind } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   فواتير مصروفات الحفلة.

   مجاميع الفواتير تُكتب على مستند الحفلة في transportCost و laborCost
   و otherExpensesCost — بنفس أسلوب اشتقاق deposit من الدفعات — حتى
   تبقى القائمة المالية ولوحة التحكم تعملان بلا تعديل، ويبقى مصدر
   الرقم واحداً. لذلك لا يجوز أن يكتب أي كود آخر في هذه الحقول.
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_TYPES: ExpenseType[] = [
  { name: "إيجار سيارات", kind: "transport" },
  { name: "نقل وشحن",     kind: "transport" },
  { name: "إيجار عمالة",  kind: "labor" },
  { name: "أخرى",         kind: "other" },
];

/** إعدادات أنواع المصروفات — مستند مستقل عمداً: حفظ إعدادات التكاليف
 *  يستبدل مستندها كاملاً، فوضعها معه يعني محو أحدهما للآخر. */
export async function getExpenseSettings(): Promise<ExpenseSettings> {
  const ref = doc(db, "expense_settings", "config");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const seed: ExpenseSettings = { types: DEFAULT_TYPES };
    await setDoc(ref, seed).catch(() => {});
    return seed;
  }
  const data = snap.data() as Partial<ExpenseSettings>;
  return { types: data.types?.length ? data.types : DEFAULT_TYPES };
}

export async function updateExpenseSettings(data: ExpenseSettings): Promise<void> {
  await setDoc(doc(db, "expense_settings", "config"), data);
}

export async function getAllExpenses(): Promise<ConcertExpense[]> {
  const snap = await getDocs(collection(db, "concert_expenses"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertExpense))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function getExpensesByConcert(concertId: string): Promise<ConcertExpense[]> {
  const snap = await getDocs(
    query(collection(db, "concert_expenses"), where("concertId", "==", concertId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertExpense))
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

/** يعيد حساب الحقول الثلاثة من الفواتير — يُنادى بعد كل إضافة أو حذف.
 *  يقرأ من قاعدة البيانات لا من حالة الواجهة حتى لا ينحرف الرقم. */
export async function recalcConcertExpenses(concertId: string): Promise<void> {
  const expenses = await getExpensesByConcert(concertId);
  const sumOf = (kind: ExpenseKind) =>
    expenses.filter((e) => e.kind === kind).reduce((s, e) => s + (e.amount ?? 0), 0);

  const transport = sumOf("transport");
  const labor = sumOf("labor");
  const other = sumOf("other");

  await updateDoc(doc(db, "concerts", concertId), {
    transportCost: transport > 0 ? transport : null,
    laborCost: labor > 0 ? labor : null,
    otherExpensesCost: other > 0 ? other : null,
  });
}

export async function addConcertExpense(
  data: Omit<ConcertExpense, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, "concert_expenses"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  await recalcConcertExpenses(data.concertId);
}

export async function deleteConcertExpense(expense: ConcertExpense): Promise<void> {
  await deleteDoc(doc(db, "concert_expenses", expense.id));
  await recalcConcertExpenses(expense.concertId);
}

/** المبلغ الصافي قبل الضريبة — الفواتير الشاملة تُطبَّع حتى تُقارن
 *  بإيراد الحفلة المحسوب قبل الضريبة على الأساس نفسه. */
export function expenseNetAmount(e: ConcertExpense, vatRate: number): number {
  if (!e.vatIncluded) return e.amount;
  return Math.round((e.amount / (1 + vatRate / 100)) * 100) / 100;
}
