import assert from "node:assert/strict";
import { beforeEach, after, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { GET, POST } from "../../app/api/activity/route";
import { PUT as settings } from "../../app/api/settings/[kind]/route";
import { POST as saveDraft } from "../../app/api/drafts/route";
import { POST as saveRole, DELETE as deleteRole } from "../../app/api/roles/route";
import { ApiError, handle, requireCaller, requirePage, withActivityResponse } from "./guard";
import { describeActivity, shouldAudit } from "../activity";
import { canAccess, pageKeyFromPath } from "../permissions";
import type { AppUser, CustomRole } from "@/types";

// All SDK I/O is replaced; these tests never load credentials or contact a project.
const app = initializeApp({ projectId: "demo-activity-tests" });
const records = new Map<string, Record<string, unknown>>();
let sequence = 0;
let rejectCreate = false;
let rejectFinalize = false;
function ref(path: string) {
  const id = path.split("/").at(-1)!;
  const snap = () => ({ id, exists: records.has(path), data: () => records.get(path), ref: ref(path) });
  return {
    id, path, get: async () => snap(),
    create: async (data: Record<string, unknown>) => {
      if (rejectCreate) throw new Error("storage unavailable");
      if (records.has(path)) throw new Error("already exists");
      records.set(path, { ...data, createdAt: Timestamp.fromMillis(1000 + sequence++) });
    },
    set: async (data: Record<string, unknown>, options?: { merge: boolean }) => records.set(path, { ...(options?.merge ? records.get(path) : {}), ...data, createdAt: Timestamp.fromMillis(1000 + sequence++) }),
    update: async (data: Record<string, unknown>) => {
      if (rejectFinalize && path.startsWith("activity_logs/")) throw new Error("finalization unavailable");
      if (!records.has(path)) throw new Error("missing document");
      records.set(path, { ...records.get(path), ...data });
    },
    delete: async () => records.delete(path),
  };
}
function collection(name: string, options: { cursor?: string; limit?: number; predicates?: [string, string, unknown][] } = {}) {
  return {
    doc: (id = `event-${sequence++}`) => ref(`${name}/${id}`),
    orderBy: () => collection(name, options),
    where: (key: string, op: string, value: unknown) => collection(name, { ...options, predicates: [...(options.predicates ?? []), [key, op, value]] }),
    startAfter: (snap: { id: string }) => collection(name, { ...options, cursor: snap.id }),
    limit: (limit: number) => collection(name, { ...options, limit }),
    get: async () => {
      let rows = [...records].filter(([path]) => path.startsWith(name + "/"));
      rows.sort((a, b) => ((b[1].createdAt as Timestamp)?.toMillis() ?? 0) - ((a[1].createdAt as Timestamp)?.toMillis() ?? 0) || b[0].localeCompare(a[0]));
      if (options.cursor) rows = rows.slice(rows.findIndex(([path]) => path === `${name}/${options.cursor}`) + 1);
      rows = rows.filter(([, data]) => (options.predicates ?? []).every(([key, op, value]) => {
        if (op === "==") return data[key] === value;
        const a = (data[key] as Timestamp).toMillis(), b = (value as Timestamp).toMillis();
        return op === ">=" ? a >= b : a <= b;
      }));
      rows = rows.slice(0, options.limit ?? rows.length);
      const docs = await Promise.all(rows.map(([path]) => ref(path).get()));
      return { docs, empty: !docs.length, size: docs.length };
    },
  };
}
const db = getFirestore(app);
mock.method(db, "collection", collection);
mock.method(db, "batch", () => {
  const operations: (() => Promise<unknown>)[] = [];
  return { set: (doc: ReturnType<typeof ref>, data: Record<string, unknown>) => operations.push(() => doc.set(data)), commit: () => Promise.all(operations.map((fn) => fn())) };
});
mock.method(db, "runTransaction", async (fn: (tx: unknown) => Promise<unknown>) => {
  const operations: (() => Promise<unknown>)[] = [];
  const result = await fn({
    get: (doc: { get: () => Promise<unknown> }) => doc.get(),
    getAll: (...refs: ReturnType<typeof ref>[]) => Promise.all(refs.map((doc) => doc.get())),
    create: (doc: ReturnType<typeof ref>, data: Record<string, unknown>) => operations.push(() => doc.create(data)),
    delete: (doc: ReturnType<typeof ref>) => operations.push(() => doc.delete()),
  });
  await Promise.all(operations.map((fn) => fn()));
  return result;
});
mock.method(getAuth(app), "verifyIdToken", async (token: string) => {
  if (token === "invalid") throw new Error("invalid token");
  return { uid: token };
});
beforeEach(() => {
  records.clear(); sequence = 0; rejectCreate = false; rejectFinalize = false;
  records.set("users/admin", { name: "المدير", email: "admin@example.test", role: "admin" });
  records.set("users/worker", { name: "موظف", email: "worker@example.test", role: "custom", customRoleId: "reader" });
  records.set("custom_roles/reader", { permissions: {} });
});
after(async () => { mock.restoreAll(); await deleteApp(app); });
function request(path: string, token = "admin", method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method, headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const logs = () => [...records].filter(([path]) => path.startsWith("activity_logs/")).map(([, data]) => data);

test("activity API rejects missing, expired and unprivileged credentials", async () => {
  assert.equal((await GET(request("/api/activity", ""))).status, 401);
  assert.equal((await GET(request("/api/activity", "invalid"))).status, 401);
  assert.equal((await GET(request("/api/activity", "worker"))).status, 403);
  assert.equal((await GET(request("/api/activity", "admin"))).status, 200);
  assert.equal(logs().length, 0);
});

test("independent activity permission grants access and revocation applies immediately", async () => {
  records.set("custom_roles/reader", { permissions: { activity: [] } });
  assert.equal((await GET(request("/api/activity", "worker"))).status, 200);
  records.set("custom_roles/reader", { permissions: { dashboard: "manage" } });
  assert.equal((await GET(request("/api/activity", "worker"))).status, 403);
  assert.equal(pageKeyFromPath("/admin/activity"), "activity");
  assert.equal(canAccess({ role: "custom" } as AppUser, { permissions: { dashboard: "manage" } } as CustomRole, "activity"), false);
});

test("built-in employee roles use the same independent permission", async () => {
  records.set("users/worker", { role: "employee", name: "موظف" });
  records.set("custom_roles/role_employee", { permissions: { employees: [] } });
  assert.equal((await GET(request("/api/activity", "worker"))).status, 403);
  records.set("custom_roles/role_employee", { permissions: { employees: [], activity: [] } });
  assert.equal((await GET(request("/api/activity", "worker"))).status, 200);
});

test("server records verified actor, result and generated target without secrets", async () => {
  const response = await handle(async () => {
    await requireCaller(request("/api/concerts?key=SECRET", "worker", "POST"), { actorId: "admin", password: "SECRET" });
    assert.equal(logs()[0].status, "pending");
    return { id: "concert-123" };
  });
  assert.equal(response.status, 200);
  assert.equal(logs()[0].actorId, "worker");
  assert.equal(logs()[0].actorName, "موظف");
  assert.equal(logs()[0].status, "success");
  assert.equal(logs()[0].targetId, "concert-123");
  assert.ok(!JSON.stringify(logs()).includes("SECRET"));
});

test("denied mutation is marked failed, never success", async () => {
  const response = await handle(async () => {
    const caller = await requireCaller(request("/api/concerts/c1", "worker", "PATCH"));
    requirePage(caller, "concerts", "تعديل الحفلات");
  });
  assert.equal(response.status, 403);
  assert.equal(logs()[0].status, "failed");
});

test("logging outage prevents mutation before it starts", async () => {
  rejectCreate = true;
  let changed = false;
  const response = await handle(async () => {
    await requireCaller(request("/api/payments", "admin", "POST"));
    changed = true;
  });
  assert.equal(response.status, 400);
  assert.equal(changed, false);
});

test("finalization outage retains pending record and successful operation response", async () => {
  const spy = mock.method(console, "error", () => {});
  const response = await handle(async () => {
    await requireCaller(request("/api/payments", "admin", "POST"));
    rejectFinalize = true;
    return { ok: true };
  });
  assert.equal(response.status, 200);
  assert.equal(logs()[0].status, "pending");
  assert.equal(spy.mock.callCount(), 1);
  spy.mock.restore();
});

test("parallel requests keep separate actors and outcomes", async () => {
  await Promise.all([
    handle(async () => { await requireCaller(request("/api/concerts/a", "admin", "PATCH")); await new Promise((r) => setTimeout(r, 10)); }),
    handle(async () => { await requireCaller(request("/api/concerts/b", "worker", "DELETE")); throw new ApiError("رفض", 403); }),
  ]);
  assert.equal(logs().find((v) => v.actorId === "admin")?.status, "success");
  assert.equal(logs().find((v) => v.actorId === "worker")?.status, "failed");
});

test("binary export records success and preserves file response", async () => {
  const response = await withActivityResponse(async () => {
    await requireCaller(request("/api/export/costs"));
    return new Response("file", { headers: { "content-type": "application/octet-stream" } });
  });
  assert.equal(await response.text(), "file");
  assert.equal(logs()[0].status, "success");
});

test("click reports cannot forge identity, server success or timestamp", async () => {
  const response = await POST(request("/api/activity", "worker", "POST", { events: [{ id: "click-1", action: "ضغط: حفظ", path: "/admin?token=SECRET", actorId: "admin", source: "server", status: "success", createdAt: "fake" }] }));
  assert.equal(response.status, 200);
  assert.equal(logs()[0].actorId, "worker");
  assert.equal(logs()[0].source, "browser");
  assert.equal(logs()[0].status, "interaction");
  assert.equal(logs()[0].path, "/admin");
  assert.equal(logs().length, 1);
});

test("malformed or oversized click batches are rejected without writes", async () => {
  for (const events of [[], Array(31).fill({}), [{ id: "../bad", path: "/", action: "click" }], [{ id: "ok", path: "https://example.test", action: "click" }]]) {
    assert.equal((await POST(request("/api/activity", "worker", "POST", { events }))).status, 400);
  }
  assert.equal(logs().length, 0);
});

test("retried clicks never overwrite historical labels or timestamps", async () => {
  const event = { id: "retry-1", action: "ضغط: حفظ", path: "/admin" };
  await POST(request("/api/activity", "worker", "POST", { events: [event, event] }));
  const original = logs()[0];
  await POST(request("/api/activity", "worker", "POST", { events: [{ ...event, action: "changed" }] }));
  assert.equal(logs().length, 1);
  assert.deepEqual(logs()[0], original);
});

test("pagination has no gaps or repeats and filters before returning", async () => {
  for (let i = 0; i < 8; i++) await ref(`activity_logs/log-${i}`).create({ actorName: i % 2 ? "أحمد" : "علي", action: "تعديل", status: "success" });
  const first = await (await GET(request("/api/activity?limit=3"))).json();
  const second = await (await GET(request(`/api/activity?limit=3&cursor=${first.nextCursor}`))).json();
  const third = await (await GET(request(`/api/activity?limit=3&cursor=${second.nextCursor}`))).json();
  assert.equal(new Set([...first.entries, ...second.entries, ...third.entries].map((v) => v.id)).size, 8);
  assert.equal(third.nextCursor, null);
  const filtered = await (await GET(request(`/api/activity?q=${encodeURIComponent("أحمد")}&status=success`))).json();
  assert.equal(filtered.entries.length, 4);
  assert.ok(filtered.entries.every((v: { actorName: string }) => v.actorName === "أحمد"));
});

test("date, cursor and limit validation reject invalid requests", async () => {
  for (const query of ["limit=0", "limit=101", "limit=NaN", "from=bad", "cursor=../bad", "status=fake", "from=2026-09-24&to=2026-09-23"]) {
    assert.equal((await GET(request(`/api/activity?${query}`))).status, 400);
  }
});

test("bounded filtered scans can continue to older matching activity", async () => {
  for (let i = 0; i < 1005; i++) await ref(`activity_logs/log-${i}`).create({ actorName: i === 0 ? "needle" : "other", status: "success" });
  const first = await (await GET(request("/api/activity?q=needle"))).json();
  assert.equal(first.entries.length, 0);
  assert.ok(first.nextCursor);
  const next = await (await GET(request(`/api/activity?q=needle&cursor=${first.nextCursor}`))).json();
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].actorName, "needle");
});

test("settings mutation respects field permission and is audited", async () => {
  records.set("custom_roles/reader", { permissions: { settings: ["vat"] } });
  const context = { params: Promise.resolve({ kind: "global" }) };
  assert.equal((await settings(request("/api/settings/global", "worker", "PUT", { vatRate: 10 }), context)).status, 200);
  assert.equal(records.get("settings/global")?.vatRate, 10);
  assert.equal((await settings(request("/api/settings/global", "worker", "PUT", { features: { production: false } }), context)).status, 403);
  assert.deepEqual(logs().map((v) => v.status), ["success", "failed"]);
});

test("draft saves use verified creator and never copy spoofed ownership", async () => {
  records.set("custom_roles/reader", { permissions: { concerts: [] } });
  const unfinished = {
    method: "bank_transfer", amount: "1250", date: "2026-09-24",
    cardType: "visa", receiverName: "", bankName: "الراجحي", senderName: "محمد",
  };
  const response = await saveDraft(request("/api/drafts", "worker", "POST", {
    data: {
      form: { clientName: "حفلة اختبار" }, paymentForm: unfinished,
      invoice: { hasInvoice: true, invoiceNumber: "INV-19" }, activeItemType: "external",
      createdBy: "admin", createdByName: "forged",
    },
  }));
  assert.equal(response.status, 200);
  const { id } = await response.json();
  const saved = records.get(`concert_drafts/${id}`);
  assert.equal(saved?.createdBy, "worker");
  assert.deepEqual(saved?.paymentForm, unfinished);
  assert.deepEqual(saved?.invoice, { hasInvoice: true, invoiceNumber: "INV-19" });
  assert.equal(saved?.activeItemType, "external");
  assert.equal(saved?.createdByName, "موظف");
  assert.equal(logs()[0].targetId, id);
});

test("role writes require the corresponding feature, including new log permission", async () => {
  const body = { data: { name: "قارئ السجل", permissions: { activity: [] } } };
  assert.equal((await saveRole(request("/api/roles", "worker", "POST", body))).status, 403);
  records.set("custom_roles/reader", { permissions: { users: ["roles_create"] } });
  const response = await saveRole(request("/api/roles", "worker", "POST", body));
  assert.equal(response.status, 200);
  const { id } = await response.json();
  assert.deepEqual(records.get(`custom_roles/${id}`)?.permissions, { activity: [] });
  assert.equal((await saveRole(request("/api/roles", "worker", "POST", { id, data: { name: "edited" } }))).status, 403);
});

test("role deletion preserves built-in and assigned roles", async () => {
  records.set("custom_roles/role_employee", { name: "موظف", builtIn: true });
  assert.equal((await deleteRole(request("/api/roles?id=role_employee", "admin", "DELETE"))).status, 400);
  assert.equal((await deleteRole(request("/api/roles?id=reader", "admin", "DELETE"))).status, 400);
  records.set("custom_roles/unused", { name: "غير مستخدم" });
  assert.equal((await deleteRole(request("/api/roles?id=unused", "admin", "DELETE"))).status, 200);
  assert.equal(records.has("custom_roles/unused"), false);
});

test("descriptions distinguish updates and exclude log-reader feedback loops", () => {
  assert.match(describeActivity("PATCH", "/api/concerts/123"), /تعديل/);
  assert.match(describeActivity("POST", "/api/roles", { id: "r1" }), /تعديل/);
  assert.equal(shouldAudit("GET", "/api/activity"), false);
  assert.equal(shouldAudit("POST", "/api/activity"), false);
  assert.equal(shouldAudit("POST", "/api/admin/last-signin"), false);
});
