import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test("واجهة المنصة لا تحتوي أرقاماً عربية ثابتة", () => {
  const files = ["app", "components", "contexts"]
    .flatMap(filesUnder)
    .filter((path) => /\.(tsx|ts|css)$/.test(path));
  const offenders = files.filter((path) => /[٠-٩۰-۹]/.test(readFileSync(path, "utf8")));
  assert.deepEqual(offenders, [], `استخدم أرقام 0-9 في الواجهة: ${offenders.join(", ")}`);
});
