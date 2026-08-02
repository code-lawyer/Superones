import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isOfficialEsignUrl } from "../lib/opc-esign-url.ts";

test("OPC accepts only the e-sign root domain and its real subdomains", () => {
  assert.equal(isOfficialEsignUrl("https://h5.esign.cn/sign"), true);
  assert.equal(isOfficialEsignUrl("https://esign.cn/sign"), true);
  assert.equal(isOfficialEsignUrl("https://evil-esign.cn/sign"), false);
  assert.equal(isOfficialEsignUrl("https://esign.cn.evil.example/sign"), false);
  assert.equal(isOfficialEsignUrl("http://h5.esign.cn/sign"), false);
});

test("OPC e-sign callback verifies the official timestamp-body HmacSHA256 contract", async () => {
  const names = [
    "NODE_ENV", "VAULT2077_OPC_ESIGN_ENABLED", "VAULT2077_OPC_ESIGN_PROVIDER",
    "VAULT2077_PUBLIC_ORIGIN", "VAULT2077_ESIGN_APP_ID", "VAULT2077_ESIGN_APP_SECRET",
    "VAULT2077_ESIGN_API_BASE_URL", "VAULT2077_ESIGN_INDIVIDUAL_TEMPLATE_ID",
    "VAULT2077_ESIGN_ORGANIZATION_TEMPLATE_ID", "VAULT2077_ESIGN_TEMPLATE_VERSION",
    "VAULT2077_ESIGN_PROVIDER_SEAL_ID", "VAULT2077_ESIGN_INDIVIDUAL_PROVIDER_SIGN_POSITION",
    "VAULT2077_ESIGN_ORGANIZATION_PROVIDER_SIGN_POSITION",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: "production",
    VAULT2077_OPC_ESIGN_ENABLED: "true",
    VAULT2077_OPC_ESIGN_PROVIDER: "esign",
    VAULT2077_PUBLIC_ORIGIN: "https://superones.top",
    VAULT2077_ESIGN_APP_ID: "5110000000000001",
    VAULT2077_ESIGN_APP_SECRET: "esign-callback-test-secret",
    VAULT2077_ESIGN_API_BASE_URL: "https://openapi.esign.cn",
    VAULT2077_ESIGN_INDIVIDUAL_TEMPLATE_ID: "individual-v1",
    VAULT2077_ESIGN_ORGANIZATION_TEMPLATE_ID: "organization-v1",
    VAULT2077_ESIGN_TEMPLATE_VERSION: "2026-08-02",
    VAULT2077_ESIGN_PROVIDER_SEAL_ID: "seal-test",
    VAULT2077_ESIGN_INDIVIDUAL_PROVIDER_SIGN_POSITION: JSON.stringify({ positionPage: "2", positionX: 420, positionY: 680 }),
    VAULT2077_ESIGN_ORGANIZATION_PROVIDER_SIGN_POSITION: JSON.stringify({ positionPage: "2", positionX: 420, positionY: 680 }),
  });
  try {
    const esign = await import(`../lib/opc-esign.ts?callback=${Date.now()}`);
    const timestamp = String(Date.now());
    const raw = JSON.stringify({ action: "SIGN_FLOW_COMPLETE", signFlowId: "flow-123" });
    const signature = createHmac("sha256", process.env.VAULT2077_ESIGN_APP_SECRET!).update(`${timestamp}${raw}`).digest("hex");
    const headers = new Headers({
      "X-Tsign-Open-App-Id": process.env.VAULT2077_ESIGN_APP_ID!,
      "X-Tsign-Open-TIMESTAMP": timestamp,
      "X-Tsign-Open-SIGNATURE-ALGORITHM": "hmac-sha256",
      "X-Tsign-Open-SIGNATURE": signature,
    });
    assert.equal(esign.verifyOpcEsignCallback(raw, headers).signFlowId, "flow-123");
    headers.set("X-Tsign-Open-SIGNATURE", "0".repeat(64));
    assert.throws(() => esign.verifyOpcEsignCallback(raw, headers), /验签失败/);

    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const responses = [
      { code: 0, data: { fileId: "file-123" } },
      { code: 0, data: { signFlowId: "flow-123" } },
      { code: 0, data: { url: "https://h5.esign.cn/sign/flow-123" } },
      { code: 0, data: { signFlowStatus: 2, signers: [
        { signStatus: 2, signFields: [{ signFieldStatus: 2 }] },
        { signStatus: 2, signFields: [{ signFieldStatus: 2 }] },
      ] } },
      { code: 0, data: { signFlowStatus: 2, signers: [{ signStatus: 2 }] } },
    ];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const flow = await esign.createOpcEsignFlow({
      reference: "OPC-20260802-A1B2C3D4E5F6",
      resumeToken: "a".repeat(43),
      party: {
        type: "organization",
        name: "张三",
        phone: "13800138000",
        organizationName: "测试企业有限公司",
        organizationCreditCode: "91310000MAC3G0M33G",
        legalRepresentativeName: "张三",
      },
      fields: Object.fromEntries([
        "order_reference", "service_code", "service_name", "service_revision", "quoted_price",
        "service_period", "service_outcome", "service_scope", "service_boundary", "provider_name",
        "provider_credit_code", "customer_name", "customer_phone", "customer_org_name",
        "customer_org_credit_code", "customer_legal_representative",
      ].map((key) => [key, key])) as never,
    });
    assert.equal(flow.flowId, "flow-123");
    const signFlowBody = requests[1].body as { signers: Array<Record<string, unknown>>; signFlowConfig: { authConfig: { orgAvailableAuthModes: string[] } } };
    assert.equal(signFlowBody.signers.length, 2);
    assert.equal("signFlowInitiator" in requests[1].body, false);
    assert.deepEqual(signFlowBody.signFlowConfig.authConfig.orgAvailableAuthModes, ["ORG_LEGALREP"]);
    assert.equal((signFlowBody.signers[1].signFields as Array<{ normalSignFieldConfig: { autoSign: boolean } }>)[0].normalSignFieldConfig.autoSign, true);
    const signUrl = await esign.getOpcEsignSignUrl(flow.flowId, "OPC-20260802-A1B2C3D4E5F6", "a".repeat(43), {
      type: "organization", name: "张三", phone: "13800138000", organizationName: "测试企业有限公司",
      organizationCreditCode: "91310000MAC3G0M33G", legalRepresentativeName: "张三",
    });
    assert.equal(signUrl, "https://h5.esign.cn/sign/flow-123");
    assert.deepEqual(await esign.queryOpcEsignFlow(flow.flowId), { status: "completed", fullySigned: true, signerCount: 2 });
    assert.deepEqual(await esign.queryOpcEsignFlow(flow.flowId), { status: "awaiting_signer", fullySigned: false, signerCount: 1 });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) Reflect.deleteProperty(process.env, name); else Reflect.set(process.env, name, value);
    }
  }
});
