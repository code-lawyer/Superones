import assert from "node:assert/strict";
import test from "node:test";
import { cleanStatementText } from "../lib/statement-text.ts";

test("X bridge counters and fallback controls are removed from statement display", () => {
  assert.equal(
    cleanStatementText("A complete statement. 💬202🔄555❤️3877👀222002📊660"),
    "A complete statement.",
  );
  assert.equal(
    cleanStatementText("A video statement. Your browser does not support the video tag. 🔗 View on Twitter"),
    "A video statement.",
  );
});
