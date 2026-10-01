import { SalesChannel } from "@/types";

export type ProductSectionItem = {
  kind?: unknown;
  salesChannel?: unknown;
  salesSections?: unknown;
};

export type ProductSectionRef = {
  id: string;
  name: string;
  channel: SalesChannel;
};

const CHANNEL_LABELS: Record<SalesChannel, string> = {
  restaurant: "المطعم",
  concerts: "الحفلات",
  contracts: "التعاقدات",
};

/** المصدر الموحد للقسم الأساسي في الجدول وملف Excel. */
export function productMainSection(
  item: ProductSectionItem,
  sections: ProductSectionRef[],
): SalesChannel | "manufactured" | "" {
  if (item.kind === "produced") return "manufactured";
  if (item.salesChannel === "restaurant" || item.salesChannel === "concerts" || item.salesChannel === "contracts") {
    return item.salesChannel;
  }
  const firstSectionId = Array.isArray(item.salesSections) ? String(item.salesSections[0] ?? "") : "";
  return sections.find((section) => section.id === firstSectionId)?.channel ?? "";
}

export function productMainSectionLabel(item: ProductSectionItem, sections: ProductSectionRef[]): string {
  const section = productMainSection(item, sections);
  if (section === "manufactured") return "منتجات مصنعة";
  if (!section) return "بلا قسم";
  return CHANNEL_LABELS[section];
}

/** الجدول يسمح بقسم فرعي واحد؛ يعيد الاسم نفسه الذي يظهر في القائمة. */
export function productSubSectionLabel(item: ProductSectionItem, sections: ProductSectionRef[]): string {
  const firstSectionId = Array.isArray(item.salesSections) ? String(item.salesSections[0] ?? "") : "";
  return sections.find((section) => section.id === firstSectionId)?.name ?? "";
}
