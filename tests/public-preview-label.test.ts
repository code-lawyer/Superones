import assert from "node:assert/strict";
import test from "node:test";
import { publicPreviewLabel } from "../lib/public-preview-label.ts";

test("public preview labels distinguish file-backed previews without exposing operational state", () => {
  assert.equal(publicPreviewLabel({}), "本地预览");
  assert.equal(publicPreviewLabel({ VAULT2077_CONTENT_PREVIEW_LABEL: " 本地全量真实试跑 " }), "本地全量真实试跑");
  assert.equal(publicPreviewLabel({ VAULT2077_DATABASE_URL: "postgresql://database.internal/vault2077" }), "");
  assert.equal(publicPreviewLabel({ DATABASE_URL: "postgresql://database.internal/vault2077" }), "");
  assert.equal(publicPreviewLabel({
    VAULT2077_DATABASE_URL: "postgresql://database.internal/vault2077",
    VAULT2077_CONTENT_PREVIEW_LABEL: "不应显示",
  }), "");
  assert.equal(publicPreviewLabel({ NODE_ENV: "production" }), "");
  assert.equal(publicPreviewLabel({
    NODE_ENV: "production",
    VAULT2077_ALLOW_FILE_PREVIEW: "true",
    VAULT2077_CONTENT_PREVIEW_LABEL: "生产构建验收预览",
  }), "生产构建验收预览");
});
