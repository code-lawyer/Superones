import assert from "node:assert/strict";
import test from "node:test";
import { dailyExtensionGrowth } from "../lib/sic-extensions.ts";

function item(id: string, total: number) {
  return {
    id,
    name: id,
    value: total,
    total,
    href: `https://example.com/${id}`,
  };
}

test("SiC extension surge ranking compares only entries present in both 24H snapshots", () => {
  const result = dailyExtensionGrowth(
    [item("steady", 120), item("surging", 180), item("new-entry", 400), item("falling", 80)],
    [item("steady", 100), item("surging", 90), item("falling", 100)],
  );

  assert.deepEqual(result.map(({ id, value }) => ({ id, value })), [
    { id: "surging", value: 90 },
    { id: "steady", value: 20 },
  ]);
});

test("SiC extension surge ranking uses a stable name tie-break and removes zero growth", () => {
  const result = dailyExtensionGrowth(
    [item("beta", 110), item("alpha", 110), item("zero", 100)],
    [item("beta", 100), item("alpha", 100), item("zero", 100)],
  );

  assert.deepEqual(result.map((entry) => entry.id), ["alpha", "beta"]);
});
