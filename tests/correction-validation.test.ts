import assert from "node:assert/strict";
import test from "node:test";
import { validateCorrectionFields, type CorrectionFields } from "../lib/correction-validation.ts";

function fields(overrides: Partial<CorrectionFields> = {}): CorrectionFields {
  return {
    recordId: "vault-record-42",
    pageUrl: "http://localhost:3000/feed#vault-record-42",
    description: "该记录的发布日期与来源原文不一致，请按原始公告更正。",
    evidenceUrl: "https://example.com/original-announcement",
    email: "reader@example.com",
    ...overrides,
  };
}

test("correction validation accepts an optional HTTP page URL but requires HTTPS evidence", () => {
  assert.deepEqual(validateCorrectionFields(fields()), {});
  assert.equal(
    validateCorrectionFields(fields({ evidenceUrl: "http://example.com/evidence" })).evidenceUrl,
    "请输入以 https:// 开头、可直接核验的原始依据地址。",
  );
});

test("correction validation returns field-specific errors", () => {
  const errors = validateCorrectionFields(fields({
    recordId: "",
    pageUrl: "javascript:alert(1)",
    description: "太短",
    evidenceUrl: "",
    email: "invalid",
  }));
  assert.deepEqual(Object.keys(errors), ["recordId", "pageUrl", "description", "evidenceUrl", "email"]);
});
