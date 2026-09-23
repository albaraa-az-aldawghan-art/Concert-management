import { AsyncLocalStorage } from "node:async_hooks";
import type { DocumentReference } from "firebase-admin/firestore";

export const activityContext = new AsyncLocalStorage<{ ref?: DocumentReference }>();

export async function finishActivity(status: "success" | "failed") {
  const ref = activityContext.getStore()?.ref;
  if (!ref) return;
  // Keep the pending record if finalization fails. Do not report a committed
  // financial operation as failed and encourage the user to submit it twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await ref.update({ status }); return; } catch { /* retry same record */ }
  }
  console.error("Activity finalization failed", ref.id);
}
