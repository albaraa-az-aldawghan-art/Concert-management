import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { svcReopenContract } from "./contracts-core";

function firestoreWithContract(status: string) {
  let updatePatch: Record<string, unknown> | undefined;
  const ref = {
    get: async () => ({ exists: true, data: () => ({ status }) }),
    update: async (patch: Record<string, unknown>) => { updatePatch = patch; },
  };
  const db = {
    collection: () => ({ doc: () => ref }),
  } as unknown as Firestore;
  return { db, updatePatch: () => updatePatch };
}

test("يعيد العقد المنتهي إلى ساري فقط", async () => {
  const fake = firestoreWithContract("completed");

  await svcReopenContract(fake.db, "contract-1");

  assert.deepEqual(fake.updatePatch(), { status: "active" });
});

test("يرفض إعادة فتح عقد ليس منتهياً أو عقد ملغى", async () => {
  const active = firestoreWithContract("active");
  const cancelled = firestoreWithContract("cancelled");

  await assert.rejects(() => svcReopenContract(active.db, "contract-1"), /العقد ليس منتهياً/);
  await assert.rejects(() => svcReopenContract(cancelled.db, "contract-1"), /لا يمكن إعادة فتح عقد ملغى/);
  assert.equal(active.updatePatch(), undefined);
  assert.equal(cancelled.updatePatch(), undefined);
});
