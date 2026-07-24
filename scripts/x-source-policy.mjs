import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const GROUPS = {
  organizationAccounts: {
    category: "official_organization",
    publisherKind: "organization",
    evidenceNature: "primary",
  },
  projectAccounts: {
    category: "official_project",
    publisherKind: "open_source_project",
    evidenceNature: "primary",
  },
  mediaAccounts: {
    category: "editorial_voice",
    publisherKind: "editorial_media",
    evidenceNature: "reported_analysis",
  },
  authoritativePeople: {
    category: "authoritative_person",
    publisherKind: "person",
    evidenceNature: "social_community",
  },
};

export function normalizeXHandle(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/^@/, "").toLocaleLowerCase("en-US");
}

export function compileXSourcePolicy(value) {
  if (!value || value.version !== 1 || value.defaultStatus !== "excluded") {
    throw new Error("X source policy must use version 1 and fail closed with defaultStatus=excluded.");
  }
  const accounts = new Map();
  for (const [field, definition] of Object.entries(GROUPS)) {
    if (!Array.isArray(value[field])) throw new Error(`X source policy ${field} must be an array.`);
    for (const rawHandle of value[field]) {
      const handle = normalizeXHandle(rawHandle);
      if (!/^[a-z0-9_]{1,30}$/.test(handle)) throw new Error(`Invalid X handle in policy: ${rawHandle}`);
      if (accounts.has(handle)) throw new Error(`X handle appears in more than one policy group: ${rawHandle}`);
      accounts.set(handle, {
        handle,
        status: "active",
        authorityTier: definition.category,
        publisherKind: definition.publisherKind,
        evidenceNature: definition.evidenceNature,
        confidence: "high",
      });
    }
  }
  return {
    version: value.version,
    defaultStatus: value.defaultStatus,
    principles: [...(value.principles ?? [])],
    accounts,
    counts: Object.fromEntries(Object.entries(GROUPS).map(([field, definition]) => [
      definition.category,
      value[field].length,
    ])),
  };
}

export async function loadXSourcePolicy(path) {
  const text = await readFile(path, "utf8");
  return {
    policy: compileXSourcePolicy(JSON.parse(text)),
    hash: createHash("sha256").update(text).digest("hex"),
    text,
  };
}
