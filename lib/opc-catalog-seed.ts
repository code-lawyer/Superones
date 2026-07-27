import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpcCatalogContent } from "./opc-catalog.ts";

export type OpcCatalogSeedDocument = {
  schemaVersion: 1;
  sourceRevision: number;
  publishedAt: string | null;
  catalog: OpcCatalogContent;
};

export function opcCatalogSeedPath() {
  return process.env.VAULT2077_OPC_SEED_PATH
    ? path.resolve(process.env.VAULT2077_OPC_SEED_PATH)
    : path.join(process.cwd(), "data", "defaults", "opc-catalog.seed.json");
}

export function readOpcCatalogSeedDocument(): OpcCatalogSeedDocument | null {
  const target = opcCatalogSeedPath();
  let raw: string;
  try {
    raw = readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const value = JSON.parse(raw) as Partial<OpcCatalogSeedDocument>;
  if (
    value.schemaVersion !== 1
    || !Number.isSafeInteger(value.sourceRevision)
    || Number(value.sourceRevision) < 1
    || (value.publishedAt !== null && typeof value.publishedAt !== "string")
    || !value.catalog
    || typeof value.catalog !== "object"
  ) {
    throw new Error(`OPC 默认 seed 无效：${target}`);
  }
  return value as OpcCatalogSeedDocument;
}

export async function writeOpcCatalogSeedDocument(document: OpcCatalogSeedDocument) {
  const target = opcCatalogSeedPath();
  await mkdir(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, target);
  return target;
}
