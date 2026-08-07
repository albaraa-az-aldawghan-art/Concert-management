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

/** باركود التكاليف المرتبط بصنف أكل — null إن كان اسماً مكتوباً فقط */
export function optionCostBarcode(cat: FoodCategory, optionName: string): string | null {
  return findOptionDef(cat, optionName)?.costItemBarcode ?? null;
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

/** متوسط سعر التكلفة = قيمة ما في اليد ÷ الرصيد (متوسط متحرك).
 *  القسمة على مجموع الوارد كانت تُبقي متوسط عمر الصنف كله، فيظل سعر
 *  شراء قديم مؤثراً بعد استهلاكه بالكامل. */
export function averageCost(item: CostItem | undefined): number {
  if (!item) return 0;
  const balance = itemBalance(item);
  if (balance <= 0) return 0;
  return (item.totalInValue ?? 0) / balance;
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

/* ═══════════════════════════════════════════════════════════════
   المرتبط بالحفلات القادمة.

   اختيار أصناف الأكل في الحفلة لا يحجز شيئاً من المخزون — الخصم لا
   يقع إلا بتسجيل منصرف فعلي. فحفلتان تريان الرصيد نفسه وكلتاهما
   صادقة لحظتها، ولا يظهر النقص إلا يوم التنفيذ.

   الحل هنا حسابي لا تخزيني: نجمع ما تحتاجه الحفلات المؤكدة القادمة
   من وصفاتها، ونطرح ما صُرف لها فعلاً، فيبقى «المرتبط». لا يُكتب شيء
   في قاعدة البيانات، فلا يمكن أن تعلق كمية محجوزة بالخطأ.
   ═══════════════════════════════════════════════════════════════ */

export interface CommitmentInput {
  concertId: string;
  categoryId: string;
  selectedOption: string;
  quantity: number | null;
}

/** باركود ← الكمية المرتبطة بحفلات قادمة ولم تُصرف بعد */
export function committedByItem(
  lines: CommitmentInput[],
  categories: FoodCategory[],
  dispensedByConcertItem: Map<string, number>
): Map<string, number> {
  // ما تحتاجه كل حفلة من كل خام
  const need = new Map<string, number>(); // `${concertId}|${barcode}` ← الكمية
  for (const l of lines) {
    if (!l.quantity || l.quantity <= 0) continue;
    const cat = categories.find((c) => c.id === l.categoryId);
    if (!cat) continue;
    const def = findOptionDef(cat, l.selectedOption);
    if (!def?.recipe?.length) continue;
    for (const line of def.recipe) {
      const k = `${l.concertId}|${line.barcode}`;
      need.set(k, (need.get(k) ?? 0) + lineRequirement(line, l.quantity));
    }
  }

  // المتبقي = المطلوب − المصروف، ولا ينزل تحت الصفر (الصرف الزائد
  // مسألة أخرى ولا يصح أن يُنقص التزام حفلة أخرى)
  const out = new Map<string, number>();
  for (const [k, required] of need) {
    const [, barcode] = k.split("|");
    const remaining = Math.max(0, required - (dispensedByConcertItem.get(k) ?? 0));
    if (remaining > 0) out.set(barcode, (out.get(barcode) ?? 0) + remaining);
  }
  return out;
}

/** المرتبط بحفلات قادمة بعد هيكل منتجات البيع: صنف الأكل صار هو صنف
 *  التكاليف نفسه بباركوده، فالاحتياج = الكمية المطلوبة مباشرةً. */
export function committedByBarcode(
  lines: { concertId: string; costItemBarcode?: string | null; quantity: number | null }[],
  dispensedByConcertItem: Map<string, number>
): Map<string, number> {
  const need = new Map<string, number>();
  for (const l of lines) {
    if (!l.costItemBarcode || !l.quantity || l.quantity <= 0) continue;
    const k = `${l.concertId}|${l.costItemBarcode}`;
    need.set(k, (need.get(k) ?? 0) + l.quantity);
  }
  const out = new Map<string, number>();
  for (const [k, required] of need) {
    const [, barcode] = k.split("|");
    const remaining = Math.max(0, required - (dispensedByConcertItem.get(k) ?? 0));
    if (remaining > 0) out.set(barcode, (out.get(barcode) ?? 0) + remaining);
  }
  return out;
}

/** ما صُرف فعلاً لكل (حفلة، صنف) — مفتاحه نفس مفتاح الاحتياج */
export function dispensedMap(
  outgoing: { concertId: string | null; itemBarcode: string; quantity: number; returnedQty?: number; damagedQty?: number }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of outgoing) {
    if (!o.concertId) continue;
    // المرتجع عاد للمخزون فلا يُحتسب مصروفاً؛ والتالف خرج ولا يعود
    const net = o.quantity - (o.returnedQty ?? 0);
    if (net <= 0) continue;
    const k = `${o.concertId}|${o.itemBarcode}`;
    m.set(k, (m.get(k) ?? 0) + net);
  }
  return m;
}

/** المتاح فعلياً = الرصيد − المرتبط بحفلات قادمة */
export function availableNow(item: CostItem | undefined, committed: Map<string, number>): number {
  if (!item) return 0;
  return Math.round((itemBalance(item) - (committed.get(item.id) ?? 0)) * 1000) / 1000;
}

/** سطر مختصر يظهر بجانب صنف الأكل مباشرة: المتوفر من خاماته.
 *  يُرجع null إن لم تكن للصنف وصفة أصلاً. عند إدخال كمية يُقارن
 *  المطلوب بالمتوفر ويُعلَّم النقص. */
export function optionStock(
  cat: FoodCategory,
  optionName: string,
  quantity: number,
  costItems: CostItem[],
  /** المرتبط بحفلات قادمة أخرى — إن مُرّر قُورن المطلوب بالمتاح فعلياً
   *  لا بالرصيد الخام، فلا ترى حفلتان نفس الكمية متاحةً لكلٍّ منهما.
   *  استثناء الحفلة الحالية يتم عند بناء الخريطة لا هنا. */
  committed?: Map<string, number>
): { text: string; short: boolean } | null {
  const def = findOptionDef(cat, optionName);
  if (!def?.recipe?.length) return null;

  const parts: string[] = [];
  let short = false;

  for (const line of def.recipe) {
    const item = costItems.find((i) => i.id === line.barcode);
    const balance = itemBalance(item);
    const held = committed?.get(line.barcode) ?? 0;
    const available = Math.round((balance - held) * 1000) / 1000;
    const unit = item?.unit ?? line.unit;
    const heldNote = held > 0 ? ` (مرتبط ${held.toLocaleString("en-US")})` : "";
    if (quantity > 0) {
      const required = Math.round(lineRequirement(line, quantity) * 1000) / 1000;
      const isShort = required > available;
      if (isShort) short = true;
      parts.push(
        `${item?.name ?? line.itemName}: ${required.toLocaleString("en-US")}/${available.toLocaleString("en-US")} ${unit}${heldNote}`
      );
    } else {
      parts.push(`${item?.name ?? line.itemName}: متاح ${available.toLocaleString("en-US")} ${unit}${heldNote}`);
    }
  }
  return { text: parts.join(" · "), short };
}
