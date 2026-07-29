import process from "node:process";
import { validateProductionConfiguration } from "../lib/production-config.ts";

const report = validateProductionConfiguration();
for (const warning of report.warnings) console.warn(`WARN ${warning}`);
if (!report.ok) {
  for (const error of report.errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "ok", ...report.summary }, null, 2));
}
