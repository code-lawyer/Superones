import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("SiC paper records preserve a readable title track when the desktop rail is constrained", async () => {
  const styles = await readFile(path.join(root, "app", "institutional-sic.css"), "utf8");

  assert.match(
    styles,
    /@media \(min-width:\s*821px\)[\s\S]*?\.sic-overview-papers \.sic-overview-record--compact summary\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(12ch,\s*1fr\) 40px;/,
  );
});

test("SiC delayed paper status stays inside the paper rail grid item", async () => {
  const overview = await readFile(path.join(root, "components", "sic-overview.tsx"), "utf8");
  const railStart = overview.indexOf('<aside className="sic-overview-papers"');
  const railEnd = overview.indexOf("</aside>", railStart);
  const delayedStatus = overview.indexOf("{delayedPaperSources.length ? (");

  assert.ok(railStart >= 0, "the paper rail must exist");
  assert.ok(railEnd > railStart, "the paper rail must have a closing element");
  assert.ok(
    delayedStatus > railStart && delayedStatus < railEnd,
    "the conditional delayed-source status must not become a separate lead-grid child",
  );
});
