import assert from "node:assert/strict";
import test from "node:test";
import { chromiumPackUrl } from "./pdf-browser";

test("رابط Chromium يطابق اسم ملف الإصدار ومعمارية خادم PDF", () => {
  assert.equal(
    chromiumPackUrl("x64"),
    "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar",
  );
  assert.equal(
    chromiumPackUrl("arm64"),
    "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.arm64.tar",
  );
});
