import { SalesChannel, SalesSection } from "@/types";

/** يرتّب الأقسام ترتيباً ثابتاً، حتى عندما تكون بعض السجلات القديمة بلا رقم ترتيب. */
export function orderSalesSections<T extends Pick<SalesSection, "id" | "order">>(sections: T[]): T[] {
  return [...sections].sort((a, b) => {
    const byOrder = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    return byOrder || a.id.localeCompare(b.id);
  });
}

/** يتحقق من أن طلب الترتيب يحتوي كل أقسام القناة نفسها مرة واحدة فقط. */
export function validateSalesSectionOrder(
  channel: SalesChannel,
  requestedIds: string[],
  existing: Array<Pick<SalesSection, "id" | "channel">>,
): string[] {
  const ids = requestedIds.filter(Boolean);
  if (ids.length !== new Set(ids).size) throw new Error("لا يمكن تكرار القسم في الترتيب");

  const channelIds = existing.filter((section) => section.channel === channel).map((section) => section.id);
  const expected = new Set(channelIds);
  if (ids.length !== channelIds.length || ids.some((id) => !expected.has(id))) {
    throw new Error("يجب أن يشمل الترتيب جميع أقسام قناة البيع نفسها");
  }
  return ids;
}
