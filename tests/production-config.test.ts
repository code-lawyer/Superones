import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionConfiguration } from "../lib/production-config.ts";

function validEnvironment() {
  const secret = "s".repeat(40);
  return {
    NODE_ENV: "production",
    VAULT2077_DATABASE_URL: "postgresql://vault2077:secure@db.internal/vault2077",
    VAULT2077_DATABASE_SSL: "require",
    VAULT2077_ICP_NUMBER: "沪ICP备2026003401号-1",
    VAULT2077_OPERATOR_CREDIT_CODE: "91310000MAC3G0M33G",
    VAULT2077_OPERATOR_REGISTERED_ADDRESS: "中国（上海）自由贸易试验区临港新片区环湖西二路888号C楼",
    VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE: "胡丛蕊",
    VAULT2077_OPERATOR_REGISTERED_CAPITAL: "50万元人民币",
    VAULT2077_LEGAL_CONTACT_EMAIL: "lanzhouda@tsinglaw.com",
    VAULT2077_LEGAL_EFFECTIVE_DATE: "2026-08-01",
    VAULT2077_FRONTIER_WRITES_ENABLED: "true",
    VAULT2077_OPC_PAPER_CHECKOUT_ENABLED: "false",
    VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "true",
    VAULT2077_OPC_PAYMENT_EMAIL_ENABLED: "true",
    VAULT2077_SMTP_HOST: "smtp.feishu.cn",
    VAULT2077_SMTP_PORT: "465",
    VAULT2077_SMTP_USER: "orders@superones.top",
    VAULT2077_SMTP_PASSWORD: "smtp-production-authorization-code",
    VAULT2077_SMTP_FROM: "orders@superones.top",
    VAULT2077_OPC_ESIGN_ENABLED: "false",
    VAULT2077_DATA_KEYS: JSON.stringify({ current: secret }),
    VAULT2077_DATA_ACTIVE_KEY_ID: "current",
    VAULT2077_OPC_RESUME_TOKEN_KEYS: JSON.stringify({ current: `${secret}8` }),
    VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID: "current",
    VAULT2077_ADMIN_SESSION_SECRET: `${secret}1`,
    VAULT2077_AUDIT_HASH_SECRET: `${secret}2`,
    VAULT2077_PUBLIC_ORIGIN: "https://superones.top",
    VAULT2077_ADMIN_ORIGIN: "https://admin.superones.top",
    VAULT2077_RANGER_MEDIA_STORAGE: "oss",
    VAULT2077_OSS_REGION: "oss-cn-shanghai",
    VAULT2077_OSS_BUCKET: "vault2077-public-media",
    VAULT2077_OSS_ACCESS_KEY_ID: "LTAI5tProductionMediaKey",
    VAULT2077_OSS_ACCESS_KEY_SECRET: "production-media-secret-key",
    VAULT2077_OSS_PUBLIC_ORIGIN: "https://media.superones.top",
    VAULT2077_OSS_INTERNAL: "true",
  };
}

test("production configuration accepts the bank-transfer-only payment path", () => {
  const paymentErrors = validateProductionConfiguration(validEnvironment()).errors.filter((issue) => /OPC_|付款|纸质签约/.test(issue));
  assert.deepEqual(paymentErrors, []);
});

test("production configuration rejects reopening retired paper checkout", () => {
  const report = validateProductionConfiguration({ ...validEnvironment(), VAULT2077_OPC_PAPER_CHECKOUT_ENABLED: "true" });
  assert.ok(report.errors.some((issue) => issue.includes("已经退役")));
});

test("production configuration requires the bank-transfer feature gate", () => {
  const report = validateProductionConfiguration({ ...validEnvironment(), VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED: "" });
  assert.ok(report.errors.some((issue) => issue.includes("OPC_OFFLINE_PAYMENT_ENABLED")));
});
