import assert from "node:assert/strict";
import test from "node:test";
import { clearFieldError, isValidEmail } from "../lib/client-form-validation.ts";

test("shared email validation accepts ordinary addresses and rejects malformed input", () => {
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("person+tag@example.co.uk"), true);
  assert.equal(isValidEmail("person@example"), false);
  assert.equal(isValidEmail("person @example.com"), false);
});

test("clearing one field error preserves the remaining errors", () => {
  const errors = { email: "invalid", note: "too short" };

  assert.deepEqual(clearFieldError(errors, "email"), {
    email: undefined,
    note: "too short",
  });
  assert.equal(clearFieldError<"email" | "note" | "repo">(errors, "repo"), errors);
});
