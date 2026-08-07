import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/.test(entry.name)) files.push(target);
  }
  return files;
}

test("the legacy OPC order facade preserves every runtime export", async () => {
  const legacy = await import(`../lib/opc-order-store.ts?facade=${Date.now()}`);
  const focused = await import(`../lib/opc-orders/index.ts?focused=${Date.now()}`);
  assert.deepEqual(Object.keys(legacy).sort(), Object.keys(focused).sort());
});

test("production callers use focused OPC order modules", async () => {
  const files = (await Promise.all([
    sourceFiles(path.join(root, "app")),
    sourceFiles(path.join(root, "lib")),
    sourceFiles(path.join(root, "scripts")),
  ])).flat();
  for (const file of files) {
    if (file === path.join(root, "lib", "opc-order-store.ts")) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /opc-order-store/, path.relative(root, file));
  }
});

test("only the internal OPC order store owns persistence and schema migration", async () => {
  const modules = ["checkout", "signature", "payment", "refund", "admin"];
  const internalStore = await readFile(path.join(root, "lib", "opc-orders", "internal-store.ts"), "utf8");
  assert.match(internalStore, /namespace: "opc-orders"/);
  assert.match(internalStore, /version: 8/);
  assert.match(internalStore, /mutateStateDocument/);
  assert.match(internalStore, /readStateDocument/);
  for (const moduleName of modules) {
    const source = await readFile(path.join(root, "lib", "opc-orders", `${moduleName}.ts`), "utf8");
    assert.doesNotMatch(source, /state-document-store/, moduleName);
    assert.doesNotMatch(source, /namespace: "opc-orders"/, moduleName);
  }
});

test("OPC route handlers cannot reach the internal order-store seam", async () => {
  const files = await sourceFiles(path.join(root, "app"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /opc-orders\/internal-store/, path.relative(root, file));
    assert.doesNotMatch(source, /mutateOpcOrderStore|readOpcOrderStore/, path.relative(root, file));
  }
});
