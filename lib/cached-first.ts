/**
 * يعرض البيانات المحلية فور توفرها، ثم يستبدلها بالنسخة الأحدث من الخادم.
 * فشل التحديث لا يمسح بيانات صالحة سبق عرضها.
 */
export async function loadCachedThenFresh<T>(options: {
  readCached: () => Promise<T>;
  readFresh: () => Promise<T>;
  hasCachedValue: (value: T) => boolean;
  onValue: (value: T, source: "cache" | "fresh") => void;
}): Promise<"cache" | "fresh"> {
  let usedCache = false;
  try {
    const cached = await options.readCached();
    if (options.hasCachedValue(cached)) {
      usedCache = true;
      options.onValue(cached, "cache");
    }
  } catch {
    // غياب الكاش طبيعي في أول زيارة أو في وضع التصفح الخاص.
  }

  try {
    const fresh = await options.readFresh();
    options.onValue(fresh, "fresh");
    return "fresh";
  } catch (error) {
    if (!usedCache) throw error;
    return "cache";
  }
}
