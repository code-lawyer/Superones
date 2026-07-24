import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAICompatibleClient, loadOpenAICompatibleConfig, ModelNotConfiguredError } from "../lib/openai-compatible-client.ts";

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
