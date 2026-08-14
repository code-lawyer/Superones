import assert from "node:assert/strict";
import test from "node:test";
import { decodeHtmlEntities } from "../lib/decode-html-entities.ts";

test("HTML entity decoding is shared, case-insensitive, and Unicode-safe", () => {
  assert.equal(decodeHtmlEntities("A&amp;B &QUOT;x&QUOT; &nbsp; &#39; &#x4E2D; &#20013;"), "A&B \"x\"   ' 中 中");
  assert.equal(decodeHtmlEntities("&unknown; &#x110000;"), "&unknown; &#x110000;");
});
