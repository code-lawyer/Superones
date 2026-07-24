import "server-only";

import sourceBundle from "@/config/source-bundle.json";
import sicSourceRegistry from "@/config/sic-source-registry.json";
import { buildSourceCatalog } from "@/lib/source-catalog-builder";
import type { SicSource } from "@/lib/sic-source-registry";

export function getSourceCatalog() {
  return buildSourceCatalog(
    sourceBundle,
    sicSourceRegistry.sources as SicSource[],
  );
}
