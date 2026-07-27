import { syncPublishedServiceCatalogSeed } from "../lib/managed-service-catalog.ts";

const result = await syncPublishedServiceCatalogSeed();
console.log(
  `OPC seed 已同步：${result.target}（revision=${result.revision}, publishedAt=${result.publishedAt ?? "preview"}）`,
);
