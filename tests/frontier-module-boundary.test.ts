import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

function importedSpecifiers(source: string) {
  return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)["']([^"']+)["']/g)]
    .map((match) => match[1]);
}

function isCompatibilityFacadeSpecifier(specifier: string) {
  return specifier.replace(/\.(?:[cm]?[jt]s)$/, "").endsWith("/frontier-store");
}

test("the Frontier compatibility facade preserves the focused capability surface", async () => {
  const [facade, admin, diagnostics, prizes, rankings, season, submissions] = await Promise.all([
    import("../lib/frontier-store.ts"),
    import("../lib/frontier/admin.ts"),
    import("../lib/frontier/diagnostics.ts"),
    import("../lib/frontier/prizes.ts"),
    import("../lib/frontier/rankings.ts"),
    import("../lib/frontier/season.ts"),
    import("../lib/frontier/submissions.ts"),
  ]);
  const focused = new Set(Object.keys({ ...admin, ...diagnostics, ...prizes, ...rankings, ...season, ...submissions }));
  assert.deepEqual(new Set(Object.keys(facade)), focused);
});

test("production callers use focused Frontier capabilities instead of the compatibility facade", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  for (const directory of ["app", "components", "lib", "scripts"]) {
    const entries = await readdir(path.join(root, directory), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (file === path.join(root, "lib", "frontier-store.ts")) continue;
      const facadeImport = importedSpecifiers(await readFile(file, "utf8")).find(isCompatibilityFacadeSpecifier);
      assert.equal(facadeImport, undefined, `${path.relative(root, file)} imports the Frontier compatibility facade`);
    }
  }
});

test("the Frontier facade detector covers nested and same-directory import specifiers", () => {
  for (const specifier of [
    "@/lib/frontier-store",
    "./frontier-store.ts",
    "../frontier-store",
    "../../lib/frontier-store",
  ]) assert.equal(isCompatibilityFacadeSpecifier(specifier), true);
  assert.equal(isCompatibilityFacadeSpecifier("./frontier/submissions.ts"), false);
});
