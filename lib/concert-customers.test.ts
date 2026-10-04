import assert from "node:assert/strict";
import test from "node:test";
import { concertCustomerId, normalizeCustomerPhone } from "./concert-customers";

test("يوحّد صيغ الجوال السعودي العربية والدولية", () => {
  assert.equal(normalizeCustomerPhone("٠٥٠ ١٢٣ ٤٥٦٧"), "0501234567");
  assert.equal(normalizeCustomerPhone("+966 50 123 4567"), "0501234567");
  assert.equal(normalizeCustomerPhone("00966-50-123-4567"), "0501234567");
});

test("يعزل الحفلات القديمة التي لا تحمل جوالاً", () => {
  assert.equal(concertCustomerId("", "abc"), "concert_abc");
  assert.equal(concertCustomerId("0501234567", "abc"), "phone_0501234567");
});

