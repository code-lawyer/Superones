import assert from "node:assert/strict";
import test from "node:test";
import { verifyEditorialProviders } from "../lib/editorial-provider-preflight.ts";

function providerEnvironment() {
  return {
    NODE_ENV: "production",
    VAULT2077_VAULT_LLM_BASE_URL: "https://api.deepseek.com/v1",
    VAULT2077_VAULT_LLM_API_KEY: "vault-key",
    VAULT2077_VAULT_LLM_MODEL: "deepseek-v4-flash",
    VAULT2077_SIC_LLM_BASE_URL: "https://api.xiaomimimo.com/v1",
    VAULT2077_SIC_LLM_API_KEY: "sic-key",
    VAULT2077_SIC_LLM_MODEL: "mimo-v2.5",
  };
}

test("deployment provider preflight proves both editorial routes with real completion calls", async () => {
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requested.push(String(input));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    }), { status: 200 });
  };
  const results = await verifyEditorialProviders(providerEnvironment(), fetcher);
  assert.deepEqual(requested, [
    "https://api.deepseek.com/v1/chat/completions",
    "https://api.xiaomimimo.com/v1/chat/completions",
  ]);
  assert.deepEqual(results.map(({ profile, providerHost, status }) => ({ profile, providerHost, status })), [
    { profile: "vault_editorial", providerHost: "api.deepseek.com", status: "ok" },
    { profile: "sic_editorial", providerHost: "api.xiaomimimo.com", status: "ok" },
  ]);
});

test("deployment provider preflight fails closed on a semantically invalid completion", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ ok: false }) } }],
  }), { status: 200 });
  await assert.rejects(
    () => verifyEditorialProviders(providerEnvironment(), fetcher),
    /未按探针协议返回 ok=true/,
  );
});
