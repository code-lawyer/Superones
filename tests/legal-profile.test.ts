import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ORIGIN,
  ICP_NUMBER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR_CREDIT_CODE,
  LEGAL_OPERATOR_NAME,
  PUBLIC_ORIGIN,
  getLegalProfile,
} from "../lib/legal-profile.ts";

test("legal profile fixes the confirmed public operator, domain and ICP filing", () => {
  const profile = getLegalProfile({});
  assert.equal(LEGAL_OPERATOR_NAME, "上海睿诚明达咨询管理有限公司");
  assert.equal(PUBLIC_ORIGIN, "https://superones.top");
  assert.equal(ADMIN_ORIGIN, "https://admin.superones.top");
  assert.equal(ICP_NUMBER, "沪ICP备2026003401号-1");
  assert.equal(profile.operatorName, LEGAL_OPERATOR_NAME);
  assert.equal(profile.unifiedSocialCreditCode, LEGAL_OPERATOR_CREDIT_CODE);
  assert.equal(profile.legalContactEmail, LEGAL_CONTACT_EMAIL);
  assert.equal(profile.effectiveDate, LEGAL_EFFECTIVE_DATE);
});

test("legal profile uses one legal contact as the customer-service fallback", () => {
  const profile = getLegalProfile({
    VAULT2077_LEGAL_CONTACT_EMAIL: "owner@example.test",
    VAULT2077_OPERATOR_CREDIT_CODE: "91310000MA1234567X",
  });
  assert.equal(profile.legalContactEmail, "owner@example.test");
  assert.equal(profile.customerServiceEmail, "owner@example.test");
  assert.equal(profile.unifiedSocialCreditCode, "91310000MA1234567X");
});
