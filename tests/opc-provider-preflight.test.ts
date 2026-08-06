import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyOpcProviders } from "../lib/opc-provider-preflight.ts";
import { verifyOpcEsignTemplates } from "../lib/opc-esign.ts";
import { validTestAlipayEnvironment } from "./alipay-test-environment.ts";

function providerEnvironment() {
  return {
    ...validTestAlipayEnvironment(),
    VAULT2077_OPC_ESIGN_PROVIDER: "esign",
    VAULT2077_ESIGN_APP_ID: "5110000000000001",
    VAULT2077_ESIGN_APP_SECRET: "esign-preflight-test-secret",
    VAULT2077_ESIGN_API_BASE_URL: "https://smlopenapi.esign.cn",
    VAULT2077_ESIGN_INDIVIDUAL_TEMPLATE_ID: "individual-v1",
    VAULT2077_ESIGN_ORGANIZATION_TEMPLATE_ID: "organization-v1",
    VAULT2077_ESIGN_TEMPLATE_VERSION: "2026-08-05",
    VAULT2077_ESIGN_PROVIDER_SEAL_ID: "seal-test",
    VAULT2077_ESIGN_INDIVIDUAL_PROVIDER_SIGN_POSITION: JSON.stringify({ positionPage: "2", positionX: 420, positionY: 680 }),
    VAULT2077_ESIGN_ORGANIZATION_PROVIDER_SIGN_POSITION: JSON.stringify({ positionPage: "2", positionX: 420, positionY: 680 }),
  };
}

const templateKeys = [
  "order_reference", "service_code", "service_name", "service_revision", "quoted_price",
  "service_period", "service_outcome", "service_scope", "service_boundary", "provider_name",
  "provider_credit_code", "customer_name", "customer_phone", "customer_org_name",
  "customer_org_credit_code", "customer_legal_representative",
];

test("OPC e-sign template probe signs official GET requests and validates both template schemas", async () => {
  const environment = providerEnvironment();
  const requests: Array<{ url: string; headers: Headers }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, headers: new Headers(init?.headers) });
    const templateId = url.endsWith("individual-v1") ? "individual-v1" : "organization-v1";
    return new Response(JSON.stringify({
      code: 0,
      data: {
        docTemplateId: templateId,
        docTemplateName: templateId,
        components: templateKeys.map((componentKey) => ({ componentKey, componentType: 1, required: true })),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const probes = await verifyOpcEsignTemplates(environment, fetcher);
  assert.deepEqual(probes.map(({ kind, componentCount, status }) => ({ kind, componentCount, status })), [
    { kind: "individual", componentCount: 16, status: "ok" },
    { kind: "organization", componentCount: 16, status: "ok" },
  ]);
  assert.equal(requests.length, 2);
  const path = "/v3/doc-templates/individual-v1";
  const expectedSignature = createHmac("sha256", environment.VAULT2077_ESIGN_APP_SECRET)
    .update(`GET\n*/*\n\n\n\n${path}`)
    .digest("base64");
  assert.equal(requests[0].headers.get("X-Tsign-Open-Ca-Signature"), expectedSignature);
  assert.equal(requests[0].headers.get("X-Tsign-Open-App-Id"), environment.VAULT2077_ESIGN_APP_ID);
});

test("OPC e-sign template probe rejects schema drift before creating a real contract", async () => {
  const fetcher: typeof fetch = async (input) => {
    const templateId = String(input).endsWith("individual-v1") ? "individual-v1" : "organization-v1";
    return new Response(JSON.stringify({
      code: 0,
      data: {
        docTemplateId: templateId,
        components: templateKeys.slice(1).map((componentKey) => ({ componentKey, componentType: 1 })),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(
    () => verifyOpcEsignTemplates(providerEnvironment(), fetcher),
    /缺少控件 Key：order_reference/,
  );
});

test("OPC provider preflight proves templates and a signed read-only trade query without exposing credentials", async () => {
  const result = await verifyOpcProviders(providerEnvironment(), fetch, {
    verifyEsignTemplates: async () => [
      { kind: "individual", templateName: "自然人服务协议", componentCount: 16, status: "ok" },
      { kind: "organization", templateName: "组织服务协议", componentCount: 16, status: "ok" },
    ],
    queryAlipayTrade: async (reference, configuration) => ({
      found: false,
      reference,
      appId: configuration.appId,
      configuredSellerId: configuration.sellerId,
      identitySource: "signed_application_query" as const,
      tradeNo: null,
      tradeStatus: null,
      amount: null,
    }),
  });

  assert.equal(result.alipay.tradeQuery, "ok");
  assert.equal(result.alipay.gatewayHost, "openapi.alipay.com");
  assert.equal(result.esign.length, 2);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /PRIVATE KEY|esign-preflight-test-secret/);
});

test("OPC provider preflight fails closed if its reserved Alipay reference already exists", async () => {
  await assert.rejects(
    () => verifyOpcProviders(providerEnvironment(), fetch, {
      verifyEsignTemplates: async () => [],
      queryAlipayTrade: async (reference, configuration) => ({
        found: true,
        reference,
        appId: configuration.appId,
        configuredSellerId: configuration.sellerId,
        identitySource: "signed_application_query" as const,
        tradeNo: "2026080522001000000000000001",
        tradeStatus: "TRADE_SUCCESS",
        amount: { currency: "CNY", minorUnits: 1, decimal: "0.01" },
      }),
    }),
    /保留订单号已存在/,
  );
});
