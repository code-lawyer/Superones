import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectSicRawContent } from "../lib/sic-collector.ts";

const output = process.argv[2] || ".collector-output/sic-content.json";
const target = path.resolve(output);
await mkdir(path.dirname(target), { recursive: true });
const packet = await collectSicRawContent();
await writeFile(target, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

const failures = packet.reports.filter((report) => report.status === "failure");
console.log(JSON.stringify({
  output: target,
  collectedAt: packet.collectedAt,
  items: packet.items.length,
  sources: packet.reports.length,
  failures: failures.length,
}));
