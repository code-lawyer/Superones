import "server-only";

import { execFileSync } from "node:child_process";
import {
  collectSicRawContent,
  ingestSicAcquisitionContent,
} from "../lib/sic-collector.ts";
import {
  getSicStoredContent,
} from "../lib/sic-content-store.ts";

function nativeCurlFetch(input: string, init?: RequestInit) {
  const args = [
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "30",
  ];
  for (const [name, value] of new Headers(init?.headers).entries()) {
    args.push("--header", `${name}: ${value}`);
  }
  args.push(input);
  const body = execFileSync(process.platform === "win32" ? "curl.exe" : "curl", args, {
    encoding: "buffer",
    maxBuffer: 12 * 1024 * 1024,
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

const sourceIds = process.argv
  .slice(2)
  .filter((value) => !value.startsWith("--"));
const selectedSourceIds = sourceIds.length > 0
  ? sourceIds
  : ["microsoft-research-blog"];
const apply = process.argv.includes("--apply");
const editorial = process.argv.includes("--editorial");
const reuseVaultEditorial = process.argv.includes("--reuse-vault-editorial");
if (reuseVaultEditorial) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境禁止复用 Vault 编辑配置；必须设置独立的 VAULT2077_SIC_LLM_* 配置。");
  }
  for (const suffix of ["BASE_URL", "API_KEY", "MODEL", "TIMEOUT_MS", "MAX_TOKENS", "PROVIDER_SORT", "PROVIDER_ORDER"] as const) {
    const sicKey = `VAULT2077_SIC_LLM_${suffix}`;
    const vaultKey = `VAULT2077_VAULT_LLM_${suffix}`;
    process.env[sicKey] = process.env[sicKey] || process.env[vaultKey];
  }
}
const fetcher = process.argv.includes("--native-curl") ? nativeCurlFetch : fetch;
const packet = await collectSicRawContent(fetcher, {
  sourceIds: selectedSourceIds,
  runMode: "bootstrap",
});
if (apply) {
  if (!editorial) throw new Error("--apply 必须同时使用 --editorial，禁止把英文占位内容写入 SiC 启动数据。");
  await ingestSicAcquisitionContent(packet, fetcher);
}

const stored = await getSicStoredContent();
const selected = new Set(selectedSourceIds);
const items = apply
  ? stored.items.filter((item) => selected.has(item.sourceId))
  : packet.items;

console.log(JSON.stringify({
  applied: apply,
  editorial,
  editorialProfileSource: reuseVaultEditorial ? "local-vault-profile-reuse" : "sic-editorial",
  selectedSourceIds,
  reports: packet.reports,
  items: items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    title: item.title,
    publishedAt: item.publishedAt,
  })),
}, null, 2));
