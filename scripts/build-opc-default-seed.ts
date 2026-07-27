import { createDefaultOpcCatalog } from "../lib/opc-catalog.ts";
import { writeOpcCatalogSeedDocument } from "../lib/opc-catalog-seed.ts";

const target = await writeOpcCatalogSeedDocument({
  schemaVersion: 1,
  sourceRevision: 2,
  publishedAt: null,
  catalog: createDefaultOpcCatalog(),
});

console.log(`OPC 首版 SKU 默认 seed 已生成：${target}`);
