/* منتجات البيع والبكجات: القراءة من المتصفح والكتابة عبر الخادم. */

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { api } from "@/lib/api";
import { SalesSection, SalesChannel, ConcertPackage, CostItem } from "@/types";

/* ── أقسام البيع ── */

export async function getSalesSections(): Promise<SalesSection[]> {
  const snap = await getDocs(collection(db, "sales_sections"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as SalesSection))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getSectionsOfChannel(channel: SalesChannel): Promise<SalesSection[]> {
  const snap = await getDocs(query(collection(db, "sales_sections"), where("channel", "==", channel)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as SalesSection))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function addSalesSection(channel: SalesChannel, name: string): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/sales-sections", { channel, name });
  return id;
}

export async function renameSalesSection(id: string, name: string): Promise<void> {
  await api.patch(`/api/sales-sections/${id}`, { name });
}

export async function deleteSalesSection(id: string): Promise<{ detached: number }> {
  return api.del<{ detached: number }>(`/api/sales-sections/${id}`);
}

/** أقسام البيع التي يظهر تحتها هذا الصنف — تُستبدل القائمة كاملة */
export async function setItemSections(barcode: string, sectionIds: string[]): Promise<void> {
  await api.put(`/api/sales-sections/item/${encodeURIComponent(barcode)}`, { sectionIds });
}

/** ترتيب أصناف قسم بيع بالسحب والإفلات */
export async function setSectionItemOrder(sectionId: string, itemOrder: string[]): Promise<void> {
  await api.patch(`/api/sales-sections/${sectionId}/item-order`, { itemOrder });
}

/** أصناف التكاليف المعروضة للبيع تحت قسم معيّن — بترتيبه المحفوظ إن
 *  وُجد (order)، وإلا أبجدياً؛ صنف أُضيف حديثاً ولم يُرتَّب بعد يُلحَق
 *  بالنهاية لا يُقحَم عشوائياً وسط الترتيب اليدوي */
export function itemsOfSection(items: CostItem[], sectionId: string, order?: string[]): CostItem[] {
  const list = items.filter((i) => (i.salesSections ?? []).includes(sectionId));
  if (!order || order.length === 0) {
    return list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }
  const rank = new Map(order.map((barcode, i) => [barcode, i]));
  return [...list].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name, "ar");
  });
}

/* ── البكجات ── */

export async function getPackages(): Promise<ConcertPackage[]> {
  const snap = await getDocs(collection(db, "packages"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ConcertPackage))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export async function getPackageById(id: string): Promise<ConcertPackage | null> {
  const snap = await getDoc(doc(db, "packages", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ConcertPackage) : null;
}

export interface PackageDraft {
  name: string;
  notes: string | null;
  items: { barcode: string; quantity: number }[];
  materials: { itemId: string; count: number }[];
}

export async function addPackage(d: PackageDraft): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/packages", d);
  return id;
}

export async function updatePackage(id: string, d: PackageDraft): Promise<void> {
  await api.patch(`/api/packages/${id}`, d);
}

export async function deletePackage(id: string): Promise<void> {
  await api.del(`/api/packages/${id}`);
}
