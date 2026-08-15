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
