import type { Firestore } from "firebase-admin/firestore";
import { kitchenCategory, kitchenConcertName, type KitchenExportOrder, type KitchenExportCandidate } from "../kitchen-export";
import { ApiError } from "./guard";

/** Read-only diagnostics: never re-send orders, confirm receipt, or fabricate missing lines. */
export async function prepareKitchenSelection(db: Firestore, orders: KitchenExportOrder[], categories?: string[]) {
  const candidates: KitchenExportCandidate[] = [];
  const included: KitchenExportOrder[] = [];
  for (let start = 0; start < orders.length; start += 100) {
    const chunk = orders.slice(start, start + 100);
    if (chunk.some(order => !order.concertId || order.concertId.includes("/"))) throw new ApiError("معرّف الحفلة غير صحيح");
    const concerts = await db.getAll(...chunk.map(order => db.collection("concerts").doc(order.concertId)));
    // Limit concurrent diagnostic queries; only empty orders need a source-food lookup.
    for (let index = 0; index < chunk.length; index++) {
      const order = { ...chunk[index] };
      const concert = concerts[index];
      const data = concert.data();
      order.concertName = data?.name || order.concertName || null;
      const name = kitchenConcertName(order);
      let code = "", reason = "";
      if (!concert.exists) { code = "missing-concert"; reason = "سجل الحفلة غير موجود؛ تعذر التحقق من بياناتها"; }
      else if (data?.status === "cancelled") { code = "cancelled"; reason = "الحفلة ملغاة؛ مستبعدة من تجهيز المطبخ"; }
      else if (!Array.isArray(order.lines) || !order.lines.length) {
        const food = await db.collection("concert_food").where("concertId", "==", order.concertId).get();
        const hasItems = food.docs.some(doc => typeof doc.data().selectedOption === "string" && doc.data().selectedOption.trim());
        code = hasItems ? "empty-snapshot" : "no-items";
        reason = hasItems ? "توجد أصناف في الحفلة، لكن طلب المطبخ المحفوظ فارغ؛ يلزم مراجعة الطلب وإعادة إرساله" : "لم تُسجّل أصناف مختارة للحفلة؛ طلب المطبخ فارغ";
      }
      const available = [...new Set((order.lines ?? []).map(line => kitchenCategory(line.categoryName)))];
      candidates.push({ id: order.id, name, categories: available, ...(code ? { notice: { id: order.id, name, code, reason } } : {}) });
      if (code) continue;
      const lines = categories ? order.lines!.filter(line => categories.includes(kitchenCategory(line.categoryName))) : order.lines!;
      if (lines.length) included.push({ ...order, lines });
    }
  }
  return { candidates, orders: included };
}
