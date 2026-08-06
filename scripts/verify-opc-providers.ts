import process from "node:process";
import { verifyOpcProviders } from "../lib/opc-provider-preflight.ts";

try {
  const result = await verifyOpcProviders();
  console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  process.exitCode = 1;
}
