import assert from "node:assert/strict";
import test from "node:test";
import {
  createEditorialProfileClient,
  createOpenAICompatibleClient,
  loadEditorialProfileConfig,
  loadOpenAICompatibleConfig,
  ModelBudgetExceededError,
  ModelNotConfiguredError,
} from "../lib/openai-compatible-client.ts";

test("blank domestic model configuration remains explicitly unconfigured", () => {
  assert.throws(() => loadOpenAICompatibleConfig({}), ModelNotConfiguredError);
});

test("OpenAI-compatible client uses chat completions and parses JSON content", async () => {
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translatedTitle: "标题" }) } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createOpenAICompatibleClient({ baseUrl: "https://llm.example.com/v1", apiKey: "secret", model: "model-a", timeoutMs: 5_000 }, fakeFetch);
  const result = await client.completeJson({ task: "test", schemaVersion: "v1", instruction: "return JSON", input: { title: "original" } });
  assert.equal(requestedUrl, "https://llm.example.com/v1/chat/completions");
  assert.equal(requestedBody.model, "model-a");
  assert.deepEqual(requestedBody.response_format, { type: "json_object" });
  assert.deepEqual(result, { translatedTitle: "标题" });
});

test("OpenAI-compatible client rejects a non-JSON assistant message", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 });
  const client = createOpenAICompatibleClient({ baseUrl: "https://llm.example.com/v1", apiKey: "secret", model: "model-a", timeoutMs: 5_000 }, fakeFetch);
  await assert.rejects(() => client.completeJson({ task: "test", schemaVersion: "v1", instruction: "return JSON", input: {} }), /有效 JSON/);
});

test("editorial profiles resolve independent Vault and SiC providers", () => {
  const environment = {
    VAULT2077_VAULT_LLM_BASE_URL: "https://vault-model.example/v1",
    VAULT2077_VAULT_LLM_API_KEY: "vault-key",
    VAULT2077_VAULT_LLM_MODEL: "vault-model",
    VAULT2077_SIC_LLM_BASE_URL: "https://sic-model.example/v1",
    VAULT2077_SIC_LLM_API_KEY: "sic-key",
    VAULT2077_SIC_LLM_MODEL: "sic-model",
  };
  assert.equal(loadEditorialProfileConfig("vault_editorial", environment).primary.model, "vault-model");
  assert.equal(loadEditorialProfileConfig("sic_editorial", environment).primary.model, "sic-model");
});

test("production profiles do not fall back to the legacy shared configuration", () => {
  assert.throws(
    () => loadEditorialProfileConfig("vault_editorial", {
      NODE_ENV: "production",
      VAULT2077_LLM_BASE_URL: "https://legacy.example/v1",
      VAULT2077_LLM_API_KEY: "legacy-key",
      VAULT2077_LLM_MODEL: "legacy-model",
    }),
    ModelNotConfiguredError,
  );
});

test("editorial profile uses its controlled fallback only after a retryable primary failure", async () => {
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requested.push(String(input));
    if (String(input).includes("primary.example")) {
      return new Response("overloaded", { status: 503 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    }), { status: 200 });
  };
  const client = createEditorialProfileClient({
    id: "sic_editorial",
    primary: { baseUrl: "https://primary.example/v1", apiKey: "one", model: "primary", timeoutMs: 5_000 },
    fallback: { baseUrl: "https://fallback.example/v1", apiKey: "two", model: "fallback", timeoutMs: 5_000 },
    maxRequestsPerRun: 2,
  }, fetcher);
  assert.deepEqual(
    await client.completeJson({ task: "test", schemaVersion: "v1", instruction: "JSON", input: {} }),
    { ok: true },
  );
  assert.deepEqual(requested, [
    "https://primary.example/v1/chat/completions",
    "https://fallback.example/v1/chat/completions",
  ]);
});

test("editorial profile enforces a per-run request budget", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{}" } }],
  }), { status: 200 });
  const client = createEditorialProfileClient({
    id: "vault_editorial",
    primary: { baseUrl: "https://model.example/v1", apiKey: "one", model: "primary", timeoutMs: 5_000 },
    maxRequestsPerRun: 1,
  }, fetcher);
  const request = { task: "test", schemaVersion: "v1", instruction: "JSON", input: {} };
  await client.completeJson(request);
  await assert.rejects(() => client.completeJson(request), ModelBudgetExceededError);
});
