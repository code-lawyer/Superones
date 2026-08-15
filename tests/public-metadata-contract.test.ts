import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const route of ["sitemap.ts", "robots.ts"]) {
  test(`${route} resolves the public origin at request time`, async () => {
    const source = await readFile(new URL(`../app/${route}`, import.meta.url), "utf8");
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /VAULT2077_PUBLIC_ORIGIN/);
  });
}
