import type { Firestore, Transaction, DocumentReference } from "firebase-admin/firestore";
import { automaticMaterialQuantity, materialRound, materialSearchKey, materialSections, type MaterialRequestLine } from "@/lib/material-requests";

export function materialSearchKeys(number: string, lines: { name: string; barcode: string }[]): string[] {
  const keys = new Set<string>();
  for (const text of [number, ...lines.flatMap(l => [l.name, l.barcode])]) {
    const normalized = materialSearchKey(text);
    for (const word of [normalized, ...normalized.split(" ")]) {
      for (let i = 1; i <= Math.min(word.length, 64); i++) keys.add(word.slice(0, i));
    }
  }
  return [...keys].slice(0, 5000);
}

/** Buffer transaction writes so automatic-request reads always precede all writes.
 * Existing cost services retain their checks and return values. Disabled policies
 * add no Firestore reads or writes. Reads of cost_items participate in concurrency
 * control, so simultaneous stock changes cannot create the same shortage twice. */
export function runMaterialStockTransaction<T>(db: Firestore, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.runTransaction(async actual => {
    const items = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
    const changed = new Set<string>();
    const writes: (() => void)[] = [];
    const capture = (ref: DocumentReference, snap: { exists: boolean; data: () => unknown }) => {
      if (ref.path?.startsWith("cost_items/") && snap.exists) items.set(ref.path, { ref, data: { ...(snap.data() as Record<string, unknown>) } });
    };
    const proxy: Transaction = new Proxy(actual, {
      get(target, property) {
        if (property === "get") return async (ref: DocumentReference) => {
          const snap = await target.get(ref); capture(ref, snap); return snap;
        };
        if (["update", "set", "create", "delete"].includes(String(property))) return (ref: DocumentReference, ...args: unknown[]) => {
          if (ref.path?.startsWith("cost_items/")) {
            const patch = args[0] as Record<string, unknown> | undefined;
            if (property === "delete") items.delete(ref.path);
            else if (patch && typeof patch === "object") {
              const old = items.get(ref.path);
              if (old) old.data = { ...old.data, ...patch };
              else if (property === "set" || property === "create") items.set(ref.path, { ref, data: { ...patch } });
              if (["totalIn", "totalOut", "materialAutoEnabled", "materialTargetStock", "minimumStock"].some(key => key in patch)) changed.add(ref.path);
            }
          }
          writes.push(() => {
            const method = Reflect.get(target, property) as (...args: unknown[]) => unknown;
            method.apply(target, [ref, ...args]);
          });
          return proxy;
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = await work(proxy);
    for (const path of changed) {
      const entry = items.get(path);
      if (!entry) continue;
      const quantity = automaticMaterialQuantity(entry.data);
      if (quantity <= 0) continue;
      const item = entry.data;
      const ref = db.collection("cost_material_requests").doc();
      const now = new Date().toISOString();
      const number = `MR-${ref.id}`;
      const line: MaterialRequestLine = {
        barcode: entry.ref.id, name: String(item.name ?? entry.ref.id), unit: String(item.unit ?? ""),
        purchaseUnit: String(item.purchaseUnit || item.unit || ""), purchaseToIssue: Number(item.purchaseToIssue) > 0 ? Number(item.purchaseToIssue) : 1,
        enteredUnit: "stock", enteredQuantity: quantity, requested: quantity, received: 0, posted: 0, cancelled: 0,
        balanceAtRequest: materialRound(Number(item.totalIn ?? 0) - Number(item.totalOut ?? 0)), minimumAtRequest: Number(item.minimumStock ?? 0),
        sections: materialSections(item.materialSections),
      };
      writes.push(() => actual.set(ref, {
        number, source: "automatic", state: "open", createdBy: "system:auto-material", requestDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
        createdAt: now, updatedAt: now, lastReceivedAt: null, section: "general", assignedTo: null, assignedToName: null, notes: "طلب تلقائي عند انخفاض الرصيد إلى الحد الأدنى", lines: [line], searchKeys: materialSearchKeys(number, [line]),
      }));
      const outstanding = materialRound(Number(item.materialOpenQuantity ?? 0) + quantity);
      writes.push(() => actual.update(entry.ref, { materialOpenQuantity: outstanding, materialReferenced: true }));
    }
    writes.forEach(write => write());
    return result;
  });
}
