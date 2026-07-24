import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJsonBounded } from "./sic-fetch.ts";

export type SicExtensionKind = "skill" | "mcp";
export type SicExtensionMode = "selected" | "surging";

export type SicExtensionItem = {
  id: string;
  name: string;
  value: number;
  href: string;
};

export type SicExtensionRankings = {
  capturedAt: string | null;
  skills: {
    selected: SicExtensionItem[];
    surging: SicExtensionItem[];
    surgingReady: boolean;
  };
  mcps: {
    selected: SicExtensionItem[];
    surging: SicExtensionItem[];
    surgingReady: boolean;
  };
};

export type ExtensionTotal = SicExtensionItem & { total: number };

type SkillProviderSnapshot = {
  capturedAt: string;
  selected: SicExtensionItem[];
  totals: ExtensionTotal[];
};

type McpProviderSnapshot = {
  capturedAt: string;
  selected: SicExtensionItem[];
  totals: ExtensionTotal[];
};

type ExtensionSnapshot = {
  capturedAt: string;
  skills: SkillProviderSnapshot | null;
  mcps: McpProviderSnapshot | null;
};

type ExtensionSnapshotStore = {
  version: 2;
  snapshots: ExtensionSnapshot[];
};

type LegacyExtensionSnapshot = {
  capturedAt: string;
  skillsSelected?: SicExtensionItem[];
  skillTotals?: ExtensionTotal[];
  mcpsSelected?: SicExtensionItem[];
  mcpTotals?: ExtensionTotal[];
};

type SkillsShSkill = {
  id?: string;
  name?: string;
  source?: string;
  installs?: number;
  url?: string;
  isDuplicate?: boolean;
};

type SkillsShPage = {
  data?: SkillsShSkill[];
  pagination?: { page?: number; hasMore?: boolean };
};

type SmitherySkill = {
  namespace?: string;
  slug?: string;
  displayName?: string;
  verified?: boolean;
  listed?: boolean;
  totalActivations?: number;
  uniqueUsers?: number;
};

type SmitheryServer = {
  qualifiedName?: string;
  displayName?: string;
  verified?: boolean;
  useCount?: number;
};

type SmitheryPage<T> = {
  pagination?: { currentPage?: number; totalPages?: number };
} & T;

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataRoot, "sic-extension-snapshots.json");
const MAX_PROVIDER_AGE_MS = 36 * 60 * 60 * 1000;
let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): ExtensionSnapshotStore {
  return { version: 2, snapshots: [] };
}

function migrateLegacyStore(value: { version?: number; snapshots?: LegacyExtensionSnapshot[] }) {
  if (value.version !== 1 || !Array.isArray(value.snapshots)) return null;
  return {
    version: 2 as const,
    snapshots: value.snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      skills: (snapshot.skillsSelected?.length || snapshot.skillTotals?.length)
        ? {
          capturedAt: snapshot.capturedAt,
          selected: snapshot.skillsSelected ?? [],
          totals: snapshot.skillTotals ?? [],
        }
        : null,
      mcps: (snapshot.mcpsSelected?.length || snapshot.mcpTotals?.length)
        ? {
          capturedAt: snapshot.capturedAt,
          selected: snapshot.mcpsSelected ?? [],
          totals: snapshot.mcpTotals ?? [],
        }
        : null,
    })),
  };
}

async function readStore(): Promise<ExtensionSnapshotStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const value = JSON.parse(await readFile(storePath, "utf8")) as ExtensionSnapshotStore | {
      version?: number;
      snapshots?: LegacyExtensionSnapshot[];
    };
    if (value.version === 2 && Array.isArray(value.snapshots)) return value as ExtensionSnapshotStore;
    const migrated = migrateLegacyStore(value);
    if (migrated) return migrated;
    throw new Error("SiC 扩展生态快照格式无效。");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new Error("SiC 扩展生态快照格式无效。");
  }
}

async function writeStore(store: ExtensionSnapshotStore) {
  await mkdir(dataRoot, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
}

function sixHourBucket(timestamp: string) {
  const date = new Date(timestamp);
  const hour = Math.floor(date.getUTCHours() / 6) * 6;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}`;
}

function referenceProviderSnapshot<T extends { capturedAt: string }>(snapshots: T[], current: T) {
  const target = new Date(current.capturedAt).getTime() - 24 * 60 * 60 * 1000;
  const tolerance = 8 * 60 * 60 * 1000;
  return snapshots
    .filter((snapshot) => Math.abs(new Date(snapshot.capturedAt).getTime() - target) <= tolerance)
    .sort((a, b) => (
      Math.abs(new Date(a.capturedAt).getTime() - target)
      - Math.abs(new Date(b.capturedAt).getTime() - target)
    ))[0];
}

function isFresh(timestamp: string) {
  const age = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(age) && age >= 0 && age <= MAX_PROVIDER_AGE_MS;
}

export function dailyExtensionGrowth(current: ExtensionTotal[], reference: ExtensionTotal[]): SicExtensionItem[] {
  const prior = new Map(reference.map((item) => [item.id, item.total]));
  return current
    .flatMap((item) => {
      const before = prior.get(item.id);
      if (before === undefined) return [];
      const value = item.total - before;
      return value > 0 ? [{ id: item.id, name: item.name, value, href: item.href }] : [];
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 20);
}

function sortByValue(items: SicExtensionItem[], limit = 20) {
  return [...items].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, limit);
}

function safeMarketHref(raw: string | undefined, fallback: string, allowedHosts: string[]) {
  try {
    const candidate = new URL(raw || fallback);
    if (candidate.protocol === "https:" && allowedHosts.includes(candidate.hostname)) return candidate.toString();
  } catch {
    // Fall back to the locally constructed canonical market URL.
  }
  return fallback;
}

function skillsShItem(skill: SkillsShSkill): SicExtensionItem | null {
  if (!skill.id || !skill.name || skill.isDuplicate || !Number.isFinite(skill.installs)) return null;
  const idPath = skill.id.split("/").map(encodeURIComponent).join("/");
  const fallback = `https://skills.sh/${idPath}`;
  return {
    id: skill.id,
    name: skill.name,
    value: Number(skill.installs),
    href: safeMarketHref(skill.url, fallback, ["skills.sh", "www.skills.sh"]),
  };
}

async function fetchSkillsShLeaderboard(headers: HeadersInit) {
  const items: SkillsShSkill[] = [];
  for (let page = 0; page < 40; page += 1) {
    const { data: payload } = await fetchJsonBounded<SkillsShPage>(
      `https://skills.sh/api/v1/skills?view=all-time&page=${page}&per_page=500`,
      { headers },
    );
    items.push(...(payload.data ?? []));
    if (!payload.pagination?.hasMore) break;
  }
  return items;
}

async function fetchSkillsSh(token: string) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  const [{ data: curatedPayload }, leaderboard] = await Promise.all([
    fetchJsonBounded<{ data?: Array<{ skills?: SkillsShSkill[] }> }>(
      "https://skills.sh/api/v1/skills/curated",
      { headers },
    ),
    fetchSkillsShLeaderboard(headers),
  ]);

  const selectedCandidates = sortByValue(
    (curatedPayload.data ?? [])
      .flatMap((collection) => collection.skills ?? [])
      .flatMap((skill) => {
        const item = skillsShItem(skill);
        return item ? [item] : [];
      }),
  );
  const audited = await Promise.all(selectedCandidates.map(async (item) => {
    const idPath = item.id.split("/").map(encodeURIComponent).join("/");
    try {
      const { data: payload } = await fetchJsonBounded<{ audits?: Array<{ status?: string }> }>(
        `https://skills.sh/api/v1/skills/audit/${idPath}`,
        { headers },
        { maxBytes: 512 * 1024 },
      );
      return (payload.audits ?? []).some((audit) => audit.status === "fail") ? null : item;
    } catch {
      return item;
    }
  }));
  const selected = audited.filter((item): item is SicExtensionItem => item !== null);
  const totals = leaderboard.flatMap((skill) => {
    const item = skillsShItem(skill);
    return item ? [{ ...item, total: item.value }] : [];
  });
  if (selected.length === 0 || totals.length === 0) throw new Error("skills.sh 未返回可用榜单。");
  return { selected, totals };
}

async function fetchAllSmithery<T extends Record<string, unknown>>(
  resource: "skills" | "servers",
  key: "skills" | "servers",
  apiKey: string,
) {
  const values: unknown[] = [];
  const headers = { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
  for (let page = 1; page <= 200; page += 1) {
    const { data: payload } = await fetchJsonBounded<SmitheryPage<T>>(
      `https://api.smithery.ai/${resource}?page=${page}&pageSize=100&verified=true&seed=2077`,
      { headers },
    );
    const pageValues = payload[key];
    if (Array.isArray(pageValues)) values.push(...pageValues);
    const totalPages = Number(payload.pagination?.totalPages);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return values;
}

async function fetchSmitherySkills(apiKey: string) {
  const skills = await fetchAllSmithery<{ skills?: SmitherySkill[] }>("skills", "skills", apiKey) as SmitherySkill[];
  const totals = skills.flatMap((skill) => {
    const id = [skill.namespace, skill.slug].filter(Boolean).join("/");
    if (!id || !skill.displayName || skill.verified === false || skill.listed === false || !Number.isFinite(skill.totalActivations)) return [];
    const total = Number(skill.totalActivations);
    const idPath = id.split("/").map(encodeURIComponent).join("/");
    return [{
      id,
      name: skill.displayName,
      value: Number(skill.uniqueUsers ?? total),
      total,
      href: `https://smithery.ai/skills/${idPath}`,
    }];
  });
  const selected = [...totals]
    .sort((a, b) => b.value - a.value || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 20)
    .map(({ total: _total, ...item }) => item);
  if (selected.length === 0) throw new Error("Smithery Skills 未返回可用榜单。");
  return { selected, totals };
}

async function fetchSmitheryMcps(apiKey: string) {
  const servers = await fetchAllSmithery<{ servers?: SmitheryServer[] }>("servers", "servers", apiKey) as SmitheryServer[];
  const totals = servers.flatMap((server) => {
    if (!server.qualifiedName || !server.displayName || server.verified === false || !Number.isFinite(server.useCount)) return [];
    const total = Number(server.useCount);
    const idPath = server.qualifiedName.split("/").map(encodeURIComponent).join("/");
    return [{
      id: server.qualifiedName,
      name: server.displayName,
      value: total,
      total,
      href: `https://smithery.ai/servers/${idPath}`,
    }];
  });
  const selected = sortByValue(totals.map(({ total: _total, ...item }) => item));
  if (selected.length === 0) throw new Error("Smithery MCP 未返回可用榜单。");
  return { selected, totals };
}

export async function getSicExtensionRankings(): Promise<SicExtensionRankings> {
  const store = await readStore();
  const skillHistory = store.snapshots.flatMap((snapshot) => snapshot.skills ? [snapshot.skills] : []);
  const mcpHistory = store.snapshots.flatMap((snapshot) => snapshot.mcps ? [snapshot.mcps] : []);
  const currentSkills = skillHistory.at(-1);
  const currentMcps = mcpHistory.at(-1);
  const skillsReference = currentSkills
    ? referenceProviderSnapshot(skillHistory.slice(0, -1), currentSkills)
    : undefined;
  const mcpsReference = currentMcps
    ? referenceProviderSnapshot(mcpHistory.slice(0, -1), currentMcps)
    : undefined;
  const skillsFresh = Boolean(currentSkills && isFresh(currentSkills.capturedAt));
  const mcpsFresh = Boolean(currentMcps && isFresh(currentMcps.capturedAt));
  const capturedAt = [currentSkills?.capturedAt, currentMcps?.capturedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    capturedAt,
    skills: {
      selected: skillsFresh ? currentSkills?.selected ?? [] : [],
      surging: skillsFresh && currentSkills && skillsReference
        ? dailyExtensionGrowth(currentSkills.totals, skillsReference.totals)
        : [],
      surgingReady: skillsFresh && Boolean(skillsReference),
    },
    mcps: {
      selected: mcpsFresh ? currentMcps?.selected ?? [] : [],
      surging: mcpsFresh && currentMcps && mcpsReference
        ? dailyExtensionGrowth(currentMcps.totals, mcpsReference.totals)
        : [],
      surgingReady: mcpsFresh && Boolean(mcpsReference),
    },
  };
}

export async function refreshSicExtensionSnapshots() {
  const skillsShToken = process.env.VERCEL_OIDC_TOKEN;
  const smitheryApiKey = process.env.VAULT2077_SMITHERY_API_KEY;
  const skillsRequest = skillsShToken
    ? fetchSkillsSh(skillsShToken)
    : smitheryApiKey
      ? fetchSmitherySkills(smitheryApiKey)
      : Promise.reject(new Error("未配置 skills.sh OIDC 或 Smithery API 密钥。"));
  const mcpsRequest = smitheryApiKey
    ? fetchSmitheryMcps(smitheryApiKey)
    : Promise.reject(new Error("未配置 Smithery API 密钥。"));
  const [skills, mcps] = await Promise.allSettled([skillsRequest, mcpsRequest]);
  if (skills.status === "rejected" && mcps.status === "rejected") {
    throw new Error("Skill 与 MCP 榜单上游均不可用。");
  }

  const capturedAt = new Date().toISOString();
  const snapshot: ExtensionSnapshot = {
    capturedAt,
    skills: skills.status === "fulfilled"
      ? { capturedAt, selected: skills.value.selected, totals: skills.value.totals }
      : null,
    mcps: mcps.status === "fulfilled"
      ? { capturedAt, selected: mcps.value.selected, totals: mcps.value.totals }
      : null,
  };

  const operation = writeChain.then(async () => {
    const store = await readStore();
    const bucket = sixHourBucket(snapshot.capturedAt);
    const existing = store.snapshots.find((item) => sixHourBucket(item.capturedAt) === bucket);
    const merged: ExtensionSnapshot = {
      capturedAt: snapshot.capturedAt,
      skills: snapshot.skills ?? existing?.skills ?? null,
      mcps: snapshot.mcps ?? existing?.mcps ?? null,
    };
    const history = store.snapshots.filter((item) => sixHourBucket(item.capturedAt) !== bucket);
    await writeStore({ version: 2, snapshots: [...history, merged].slice(-124) });
    return {
      capturedAt,
      skills: snapshot.skills?.selected.length ?? 0,
      mcps: snapshot.mcps?.selected.length ?? 0,
      errors: {
        skills: skills.status === "rejected"
          ? skills.reason instanceof Error ? skills.reason.message : "Skill 榜单失败。"
          : null,
        mcps: mcps.status === "rejected"
          ? mcps.reason instanceof Error ? mcps.reason.message : "MCP 榜单失败。"
          : null,
      },
    };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}
