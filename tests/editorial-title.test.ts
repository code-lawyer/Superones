import assert from "node:assert/strict";
import test from "node:test";
import { cleanEditorialTitle } from "../lib/editorial-title.ts";

test("known AINews publication labels are removed from public titles", () => {
  assert.equal(
    cleanEditorialTitle("[AINews] AI is eating Finance; AIE NYC now open"),
    "AI is eating Finance; AIE NYC now open",
  );
  assert.equal(cleanEditorialTitle("[ AI News ]：Weekly dispatch"), "Weekly dispatch");
});

test("meaningful bracketed title prefixes are preserved", () => {
  assert.equal(cleanEditorialTitle("[RFC] Add a stable transport contract"), "[RFC] Add a stable transport contract");
  assert.equal(cleanEditorialTitle("[Release] Version 3.1"), "[Release] Version 3.1");
});
