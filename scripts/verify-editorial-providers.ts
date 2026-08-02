import process from "node:process";
import { verifyEditorialProviders } from "../lib/editorial-provider-preflight.ts";

try {
  const results = await verifyEditorialProviders();
  console.log(JSON.stringify({ status: "ok", probes: results }, null, 2));
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  process.exitCode = 1;
}
