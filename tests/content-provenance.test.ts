import assert from "node:assert/strict";
import test from "node:test";
import { isEventInput } from "../lib/content-provenance.ts";

test("only information-waterfall records may become event evidence", () => {
  assert.equal(isEventInput("information"), true);
  assert.equal(isEventInput("roadside"), false);
  assert.equal(isEventInput("documents"), false);
  assert.equal(isEventInput("papers"), false);
  assert.equal(isEventInput("courses"), false);
  assert.equal(isEventInput("podcasts"), false);
});
