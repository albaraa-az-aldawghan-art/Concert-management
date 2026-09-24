import assert from "node:assert/strict";
import test from "node:test";
import { loadCachedThenFresh } from "./cached-first";

test("cached data is shown before a slow fresh request completes", async () => {
  let releaseFresh!: (value: string[]) => void;
  const fresh = new Promise<string[]>((resolve) => { releaseFresh = resolve; });
  const values: Array<{ value: string[]; source: "cache" | "fresh" }> = [];

  const loading = loadCachedThenFresh({
    readCached: async () => ["cached"],
    readFresh: () => fresh,
    hasCachedValue: (value) => value.length > 0,
    onValue: (value, source) => values.push({ value, source }),
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(values, [{ value: ["cached"], source: "cache" }]);

  releaseFresh(["fresh"]);
  assert.equal(await loading, "fresh");
  assert.deepEqual(values.at(-1), { value: ["fresh"], source: "fresh" });
});

test("cached data remains usable when the network request fails", async () => {
  const values: string[][] = [];
  const source = await loadCachedThenFresh({
    readCached: async () => ["cached"],
    readFresh: async () => { throw new Error("offline"); },
    hasCachedValue: (value) => value.length > 0,
    onValue: (value) => values.push(value),
  });

  assert.equal(source, "cache");
  assert.deepEqual(values, [["cached"]]);
});

test("network errors remain visible when no cached data exists", async () => {
  await assert.rejects(() => loadCachedThenFresh({
    readCached: async () => [] as string[],
    readFresh: async () => { throw new Error("offline"); },
    hasCachedValue: (value) => value.length > 0,
    onValue: () => undefined,
  }), /offline/);
});
