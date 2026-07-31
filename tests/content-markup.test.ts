import assert from "node:assert/strict";
import test from "node:test";
import {
  inferContentFormat,
  normalizeStructuredContent,
  repairLegacyFlattenedMarkdown,
  safeMarkdownUrl,
} from "../lib/content-markup.ts";

test("structured content keeps Markdown block boundaries while removing unsafe controls", () => {
  assert.equal(
    normalizeStructuredContent("  ## Release\r\n\r\n- one\u0000\r\n- two  ", 200),
    "## Release\n\n- one\n- two",
  );
});

test("structured content truncates only at a complete Markdown block boundary", () => {
  assert.equal(
    normalizeStructuredContent("## First\n\nA complete paragraph.\n\n## Second\n\nTrailing text.", 40),
    "## First\n\nA complete paragraph.",
  );
  assert.equal(
    normalizeStructuredContent("```text\nan overlong fenced block\n```", 12),
    "",
  );
  assert.equal(
    normalizeStructuredContent("A single paragraph that exceeds the limit.", 12),
    "",
  );
});

test("content format inference distinguishes Markdown from ordinary prose", () => {
  assert.equal(inferContentFormat("A plain sentence."), "plain_text");
  assert.equal(inferContentFormat("## Release\n\n- [Notes](https://example.com)"), "markdown");
});

test("legacy one-line release Markdown can be migrated back into blocks", () => {
  const repaired = repairLegacyFlattenedMarkdown(
    "``` NVIM v0.13.0 Build type: RelWithDebInfo ``` ## Release notes - [Changelog](https://example.com) ## Install ### Windows #### Zip 1. Download **nvim.zip** 2. Extract it",
  );
  assert.match(repaired, /^```\nNVIM v0\.13\.0 Build type: RelWithDebInfo\n```/);
  assert.match(repaired, /\n## Release notes\n/);
  assert.match(repaired, /\n- \[Changelog\]/);
  assert.match(repaired, /\n### Windows\n/);
  assert.match(repaired, /\n1\. Download \*\*nvim\.zip\*\*\n2\. Extract it/);
});

test("Markdown links accept only absolute HTTP(S) destinations", () => {
  assert.equal(safeMarkdownUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safeMarkdownUrl("http://example.com/path"), "http://example.com/path");
  assert.equal(safeMarkdownUrl("./relative"), undefined);
  assert.equal(safeMarkdownUrl("javascript:alert(1)"), undefined);
  assert.equal(safeMarkdownUrl("data:text/html,unsafe"), undefined);
});
