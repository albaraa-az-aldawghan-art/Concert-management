import assert from "node:assert/strict";
import test from "node:test";
import { draftSnapshot } from "./draft-snapshot";

test("draft snapshot ignores object key order", () => {
  assert.equal(
    draftSnapshot({ form: { phone: "050", name: "عميل" }, items: { b: 2, a: 1 } }),
    draftSnapshot({ items: { a: 1, b: 2 }, form: { name: "عميل", phone: "050" } })
  );
});

test("draft snapshot detects raw unfinished input", () => {
  const base = { form: { clientName: "عميل" }, paymentForm: { amount: "" } };
  const changed = { form: { clientName: "عميل" }, paymentForm: { amount: "1250" } };
  assert.notEqual(draftSnapshot(base), draftSnapshot(changed));
});
