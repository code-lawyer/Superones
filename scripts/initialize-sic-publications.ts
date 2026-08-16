import "server-only";

import {
  getSicPublicationStorageStatus,
  initializeNormalizedSicPublications,
} from "../lib/sic-content-store.ts";
import { closePersistencePool } from "../lib/state-document-store.ts";

try {
  const state = await initializeNormalizedSicPublications();
  const storage = await getSicPublicationStorageStatus();
  if (!storage.initialized || !storage.aligned || storage.activeCount !== state.itemCount) {
    throw new Error("SiC 逐条发布表初始化后未与兼容投影对齐。");
  }
  console.log(JSON.stringify({
    initialized: storage.initialized,
    aligned: storage.aligned,
    activeCount: storage.activeCount,
    activeByGroup: storage.activeByGroup,
  }, null, 2));
} finally {
  await closePersistencePool();
}
