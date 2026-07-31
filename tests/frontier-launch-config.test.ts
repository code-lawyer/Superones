import assert from "node:assert/strict";
import test from "node:test";
import {
  frontierMasterWritesEnabled,
  isValidFrontierReward,
} from "../lib/frontier-launch-config.ts";

test("the emergency master switch defaults open locally and can close writes", () => {
  assert.equal(frontierMasterWritesEnabled({ NODE_ENV: "development" }), true);
  assert.equal(frontierMasterWritesEnabled({
    NODE_ENV: "development",
    VAULT2077_FRONTIER_WRITES_ENABLED: "false",
  }), false);
});

test("production master writes require an explicit switch", () => {
  assert.equal(frontierMasterWritesEnabled({ NODE_ENV: "production" }), false);
  assert.equal(frontierMasterWritesEnabled({
    NODE_ENV: "production",
    VAULT2077_FRONTIER_WRITES_ENABLED: "true",
  }), true);
});

test("season rewards reject placeholders and accept real public copy", () => {
  assert.equal(isValidFrontierReward("冠军奖励待公布"), false);
  assert.equal(isValidFrontierReward("季度冠军奖金人民币 10,000 元"), true);
});
