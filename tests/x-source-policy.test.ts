import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileXSourcePolicy, normalizeXHandle } from "../scripts/x-source-policy.mjs";

const policyInput = JSON.parse(await readFile(new URL("../config/x-source-policy.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../config/source-registry.json", import.meta.url), "utf8"));
const bundle = JSON.parse(await readFile(new URL("../config/source-bundle.json", import.meta.url), "utf8"));

test("X policy is fail-closed, explicit, and contains no duplicate handles", () => {
  const policy = compileXSourcePolicy(policyInput);
  const registered = new Set(
    registry.channels
      .filter((source: { channelType: string }) => source.channelType === "x")
      .map((source: { channelIdentifier: string }) => normalizeXHandle(source.channelIdentifier)),
  );

  assert.equal(policy.defaultStatus, "excluded");
  assert.equal(policy.accounts.size, 34);
  assert.ok([...policy.accounts.keys()].every((handle) => registered.has(handle)));
});

test("runtime X stream contains only policy-approved authoritative accounts", () => {
  const policy = compileXSourcePolicy(policyInput);
  const statements = bundle.sources.filter((source: { sourceStream: string; originPlatform: string }) => source.sourceStream === "roadside" && source.originPlatform === "x");
  const handles = statements.map((source: { channelIdentifier: string }) => normalizeXHandle(source.channelIdentifier));

  assert.equal(statements.length, 34);
  assert.equal(new Set(handles).size, statements.length);
  assert.ok(handles.every((handle: string) => policy.accounts.has(handle)));
  assert.ok(statements.every((source: { originPlatform: string }) => source.originPlatform === "x"));
  assert.ok(statements.every((source: { classificationConfidence: string }) => source.classificationConfidence === "high"));
  assert.ok(statements.every((source: { publisherKind: string }) => source.publisherKind === "person"));
});

test("X cleanup accounting distinguishes candidates, removals, and merged directory declarations", () => {
  assert.equal(bundle.counts.xCandidates, 179);
  assert.equal(bundle.counts.xRunnableCandidates, 160);
  assert.equal(bundle.counts.statements, 34);
  assert.equal(bundle.counts.roadside, 37);
  assert.equal(bundle.counts.xExcludedFromRuntime, 126);
  assert.equal(bundle.counts.xDuplicateDiscoveriesMerged, 9);
});
