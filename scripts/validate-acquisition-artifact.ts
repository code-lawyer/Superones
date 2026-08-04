import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { validateAcquisitionRunEvidence } from "../lib/acquisition-run-evidence.ts";

const outputRoot = path.resolve(process.argv[2] || process.env.VAULT2077_COLLECTOR_OUTPUT_DIR || ".collector-output");
const uploadAuthorization = path.join(outputRoot, ".validated-for-upload");
await unlink(uploadAuthorization).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
});
const manifest = await validateAcquisitionRunEvidence(outputRoot);
await writeFile(uploadAuthorization, "validated\n", { encoding: "utf8", mode: 0o600 });
console.log(`evidence=${manifest.status} lane=${manifest.lane} files=${manifest.files.length}`);
