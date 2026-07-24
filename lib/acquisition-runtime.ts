import "server-only";

import { configuredAcquisitionReceiver } from "./acquisition-inbox.ts";
import { createAcquisitionBatchProcessor } from "./acquisition-processor.ts";
import { createAcquisitionWorker } from "./acquisition-worker.ts";

let worker: ReturnType<typeof createAcquisitionWorker> | undefined;

export function configuredAcquisitionWorker() {
  if (worker) return worker;
  worker = createAcquisitionWorker({
    inbox: configuredAcquisitionReceiver(),
    processBatch: createAcquisitionBatchProcessor(),
  });
  return worker;
}
