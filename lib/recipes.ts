import { FoodCategory, FoodOptionDef, RecipeLine, CostItem } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   وصفات أصناف الأكل — الربط بين صنف الأكل وخامات التكاليف.

   أصناف الأكل كانت نصوصاً بلا معرّفات، ولا يوجد «تعديل اسم» أصلاً
   (تغيير الاسم = حذف وإضافة)، فربط الوصفة بالاسم كان سيُضيّعها بصمت.
   لذلك أُضيف optionDefs بمعرّفات ثابتة، وتبقى options كما هي ليقرأها
   العقد والمطبخ والموظفون بلا تغيير.
   ═══════════════════════════════════════════════════════════════ */

/** يُرجع تعريفات الأصناف، مشتقّة من options للأقسام التي لم تُحدَّث بعد */
export function optionDefsOf(cat: FoodCategory): FoodOptionDef[] {
  if (cat.optionDefs?.length) return cat.optionDefs;
  if (cat.options.length > 0) return cat.options.map((name) => ({ id: name, name }));
  // قسم بلا أصناف — الوصفة تُعلَّق على القسم نفسه
  return [{ id: "", name: cat.name }];
}

export function findOptionDef(cat: FoodCategory, optionName: string): FoodOptionDef | null {
  const defs = optionDefsOf(cat);
  return defs.find((d) => d.name === optionName) ?? defs.find((d) => d.id === optionName) ?? null;
}

/** يبني options من optionDefs — يجب أن يُكتبا معاً دائماً */
export function optionsFromDefs(defs: FoodOptionDef[]): string[] {
  return defs.filter((d) => d.id !== "" || d.name).map((d) => d.name);
}

export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** الكمية المطلوبة من خام واحد لعدد معيّن من الأصناف */
export function lineRequirement(line: RecipeLine, quantity: number): number {
  const per = line.perQty > 0 ? line.perQty : 1;
  return (line.qty / per) * quantity;
}

/** متوسط سعر الشراء — تقديري فقط، لا يُخزَّن.
 *  ملاحظة: totalInValue لا ينقص عند الصرف، فهو متوسط عمر الصنف كله. */
export function averageCost(item: CostItem | undefined): number {
  if (!item || !item.totalIn || item.totalIn <= 0) return 0;
  return (item.totalInValue ?? 0) / item.totalIn;
}

export function itemBalance(item: CostItem | undefined): number {
  if (!item) return 0;
  return (item.totalIn ?? 0) - (item.totalOut ?? 0);
}

export interface RequirementRow {
  barcode: string;
  itemName: string;
  unit: string;
  required: number;
  available: number;
  short: boolean;
  estimatedCost: number;
}

export interface SelectedFoodLine {
  categoryId: string;
  selectedOption: string;
  quantity: number;
}

/** يجمع احتياج كل الخامات عبر أصناف الأكل المختارة.
 *  التجميع يتم قبل التقريب حتى لا تتراكم فروق الكسور. */
export function aggregateRequirements(
  selected: SelectedFoodLine[],
  categories: FoodCategory[],
  costItems: CostItem[]
): RequirementRow[] {
  const byBarcode = new Map<string, { name: string; unit: string; required: number }>();

  for (const sel of selected) {
    if (!sel.quantity || sel.quantity <= 0) continue;
    const cat = categories.find((c) => c.id === sel.categoryId);
    if (!cat) continue;
    const def = findOptionDef(cat, sel.selectedOption);
    if (!def?.recipe?.length) continue;

    for (const line of def.recipe) {
      const cur = byBarcode.get(line.barcode) ?? { name: line.itemName, unit: line.unit, required: 0 };
      cur.required += lineRequirement(line, sel.quantity);
      byBarcode.set(line.barcode, cur);
    }
  }

  const rows: RequirementRow[] = [];
  for (const [barcode, agg] of byBarcode) {
    const item = costItems.find((i) => i.id === barcode);
    const required = Math.round(agg.required * 1000) / 1000;
    const available = itemBalance(item);
    rows.push({
      barcode,
      itemName: item?.name ?? agg.name,
      unit: item?.unit ?? agg.unit,
      required,
      available,
      short: required > available,
      estimatedCost: Math.round(required * averageCost(item) * 100) / 100,
    });
  }
  return rows.sort((a, b) => a.itemName.localeCompare(b.itemName, "ar"));
}

export function totalEstimatedCost(rows: RequirementRow[]): number {
  return Math.round(rows.reduce((s, r) => s + r.estimatedCost, 0) * 100) / 100;
}
