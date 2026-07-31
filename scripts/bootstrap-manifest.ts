import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const BOOTSTRAP_SEED_FILES = [
  "content-store.seed.json",
  "sic-content-store.seed.json",
  "direct-rankings.seed.json",
] as const;

export type BootstrapManifest = {
  version: 1;
  promotedAt: string;
  sourceRunDirectory: string;
  counts: {
    information: number;
    roadside: number;
    events: number;
    sic: number;
    rankingBoards: number;
    rankingItems: number;
  };
  files: Record<string, { sha256: string; bytes: number }>;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array.`);
  return value;
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function buildBootstrapManifest(
  files: Record<(typeof BOOTSTRAP_SEED_FILES)[number], string>,
  sourceRunDirectory: string,
  promotedAt = new Date().toISOString(),
): BootstrapManifest {
  const content = object(JSON.parse(files["content-store.seed.json"]), "content seed");
  const sic = object(JSON.parse(files["sic-content-store.seed.json"]), "SiC seed");
  const rankings = object(JSON.parse(files["direct-rankings.seed.json"]), "ranking seed");
  const information = array(content.information, "content information");
  const events = array(content.events, "content events");
  const sicItems = array(sic.items, "SiC items");
  const boards = array(rankings.boards, "ranking boards");
  const roadside = information.filter((value) => (
    object(value, "information item").contentGroup === "roadside"
  )).length;

  return {
    version: 1,
    promotedAt,
    sourceRunDirectory,
    counts: {
      information: information.length - roadside,
      roadside,
      events: events.length,
      sic: sicItems.length,
      rankingBoards: boards.length,
      rankingItems: boards.reduce((sum, value) => (
        sum + array(object(value, "ranking board").items, "ranking items").length
      ), 0),
    },
    files: Object.fromEntries(BOOTSTRAP_SEED_FILES.map((name) => [
      name,
      {
        sha256: hash(files[name]),
        bytes: Buffer.byteLength(files[name]),
      },
    ])),
  };
}

export async function refreshBootstrapManifest(
  directory = path.resolve("data", "bootstrap"),
) {
  const current = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  ) as BootstrapManifest;
  const files = Object.fromEntries(await Promise.all(
    BOOTSTRAP_SEED_FILES.map(async (name) => [
      name,
      await readFile(path.join(directory, name), "utf8"),
    ] as const),
  )) as Record<(typeof BOOTSTRAP_SEED_FILES)[number], string>;
  const sourceRunDirectory = path.isAbsolute(current.sourceRunDirectory)
    ? path.relative(process.cwd(), current.sourceRunDirectory).replaceAll("\\", "/")
    : current.sourceRunDirectory.replaceAll("\\", "/");
  if (!sourceRunDirectory || sourceRunDirectory.startsWith("../")) {
    throw new Error("Bootstrap source run must stay inside the workspace.");
  }
  const manifest = buildBootstrapManifest(
    files,
    sourceRunDirectory,
    current.promotedAt,
  );
  await writeFile(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export async function verifyBootstrapManifest(
  directory = path.resolve("data", "bootstrap"),
) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  ) as BootstrapManifest;
  if (manifest.version !== 1) throw new Error("Unsupported bootstrap manifest version.");
  const files = Object.fromEntries(await Promise.all(
    BOOTSTRAP_SEED_FILES.map(async (name) => [
      name,
      await readFile(path.join(directory, name), "utf8"),
    ] as const),
  )) as Record<(typeof BOOTSTRAP_SEED_FILES)[number], string>;
  const actual = buildBootstrapManifest(
    files,
    manifest.sourceRunDirectory,
    manifest.promotedAt,
  );
  for (const name of BOOTSTRAP_SEED_FILES) {
    if (
      manifest.files[name]?.sha256 !== actual.files[name].sha256
      || manifest.files[name]?.bytes !== actual.files[name].bytes
    ) {
      throw new Error(`Bootstrap seed verification failed for ${name}.`);
    }
  }
  if (JSON.stringify(manifest.counts) !== JSON.stringify(actual.counts)) {
    throw new Error("Bootstrap manifest counts do not match seed content.");
  }
  return manifest;
}
