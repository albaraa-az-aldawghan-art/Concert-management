import { ConcertFood, SalesSection } from "@/types";

type OrderableConcertFood = Pick<
  ConcertFood,
  "id" | "categoryId" | "categoryName" | "selectedOption" | "costItemBarcode"
>;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
}

/**
 * يرتّب بنود الحفلة وقت العرض حسب الترتيب الحالي في منتجات البيع.
 * لا نخزّن نسخة من الترتيب داخل الحفلة، لذلك يسري أي ترتيب جديد فوراً على
 * الحفلات القديمة والجديدة. المعرّف هو المرجع الأول، واسم القسم بديل لازم
 * للسجلات القديمة التي ما زالت تحمل معرّفات أقسام الطعام السابقة.
 */
export function sortConcertFoodByCurrentOrder<T extends OrderableConcertFood>(
  food: readonly T[],
  sections: readonly SalesSection[]
): T[] {
  const orderedSections = sections
    .map((section, sourceIndex) => ({ section, sourceIndex }))
    .sort((a, b) => {
      const orderDiff = (a.section.order ?? a.sourceIndex) - (b.section.order ?? b.sourceIndex);
      return orderDiff !== 0 ? orderDiff : a.sourceIndex - b.sourceIndex;
    });

  const sectionById = new Map(orderedSections.map((entry, index) => [entry.section.id, { ...entry, index }]));
  const sectionByName = new Map(
    orderedSections.map((entry, index) => [normalizeName(entry.section.name), { ...entry, index }])
  );

  return food
    .map((item, sourceIndex) => {
      const resolved = sectionById.get(item.categoryId) ?? sectionByName.get(normalizeName(item.categoryName));
      const itemOrder = resolved?.section.itemOrder ?? [];
      const itemRank = item.costItemBarcode ? itemOrder.indexOf(item.costItemBarcode) : -1;
      return {
        item,
        sourceIndex,
        sectionRank: resolved?.index ?? Number.POSITIVE_INFINITY,
        itemRank: itemRank >= 0 ? itemRank : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (a.sectionRank !== b.sectionRank) return a.sectionRank - b.sectionRank;
      if (!Number.isFinite(a.sectionRank)) {
        const categoryDiff = a.item.categoryName.localeCompare(b.item.categoryName, "ar");
        if (categoryDiff !== 0) return categoryDiff;
      }
      if (a.itemRank !== b.itemRank) return a.itemRank - b.itemRank;
      const nameDiff = a.item.selectedOption.localeCompare(b.item.selectedOption, "ar");
      return nameDiff !== 0 ? nameDiff : a.sourceIndex - b.sourceIndex;
    })
    .map(({ item }) => item);
}
