import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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

test("new numeric/date/month fields must use the locale-independent shared control", () => {
  const offenders: string[] = [];
  for (const path of ["app", "components"].flatMap(filesUnder).filter(path => path.endsWith(".tsx"))) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === "input") {
        const type = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "type") as ts.JsxAttribute | undefined;
        if (type?.initializer && ts.isStringLiteral(type.initializer) && ["number", "date", "month", "time", "datetime-local"].includes(type.initializer.text)) offenders.push(path);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(offenders, [], "Use Input/LatinInput so browser locale cannot change digits");
});
