import assert from "node:assert/strict";
import test from "node:test";
import { parseSicView, sicViewHref } from "../lib/sic-view.ts";

test("SiC view parser defaults invalid and repeated input to one bounded view", () => {
  assert.equal(parseSicView(undefined), "papers");
  assert.equal(parseSicView("documents"), "documents");
  assert.equal(parseSicView(["rankings", "papers"]), "rankings");
  assert.equal(parseSicView("unknown"), "papers");
});

test("SiC view links preserve a stable addressable anchor", () => {
  assert.equal(sicViewHref("courses"), "/sic?view=courses#sic-group-courses");
  assert.equal(sicViewHref("rankings"), "/sic?view=rankings#sic-rankings");
});
