import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { validateContentBatch } from "../lib/content-contract.ts";

const targets = process.argv.slice(2);
if (targets.length === 0) throw new Error("请提供一个或多个采集包文件或目录。");

const files: string[] = [];
for (const target of targets) {
  const resolved = path.resolve(target);
  const details = await stat(resolved);
  if (details.isDirectory()) {
    files.push(...(await readdir(resolved))
      .filter((name) => name.startsWith("vault2077-") && name.endsWith(".json"))
      .map((name) => path.join(resolved, name)));
  } else {
    files.push(resolved);
  }
}

let information = 0;
let repositories = 0;
for (const file of files) {
  const batch = validateContentBatch(JSON.parse(await readFile(file, "utf8")) as unknown);
  information += batch.information.length;
  repositories += batch.repositories.length;
}

console.log(JSON.stringify({ ok: true, packets: files.length, information, repositories }));
