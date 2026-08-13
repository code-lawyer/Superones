const credentialName = "(?:api[_-]?key|access[_-]?key(?:[_-]?(?:id|secret))?|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|authorization|cookie|session[_-]?(?:id|token)|token)";

const highConfidenceRules = [
  { id: "private-key", pattern: /-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/u },
  { id: "postgres-credentials", pattern: /\bpostgresql(?:\+\w+)?:\/\/(?!\[REDACTED\]@)[^@\s]+@/iu },
  { id: "url-userinfo", pattern: /\bhttps?:\/\/[^/@\s:]+:[^/@\s]+@/iu },
  { id: "provider-credential", pattern: /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|LTAI[A-Za-z0-9]{12,})\b/u },
] as const;

const contextualRules = [
  { id: "authorization-header", pattern: /Authorization\s*:\s*(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/iu },
  { id: "credential-json-field", pattern: new RegExp(`"${credentialName}"\\s*:\\s*"(?!\\[REDACTED\\])[^"\\r\\n]{8,}"`, "iu") },
  { id: "credential-assignment", pattern: new RegExp(`\\b${credentialName}\\b\\s*(?:=|:)\\s*["']?(?!\\[REDACTED\\])[^\\s;,"']{8,}`, "iu") },
  { id: "credential-query", pattern: new RegExp(`[?&]${credentialName}=(?!%5BREDACTED%5D|\\[REDACTED\\])[^&#\\s]{8,}`, "iu") },
  { id: "cookie-header", pattern: /\b(?:Set-Cookie|Cookie)\s*:\s*\S+/iu },
] as const;

export type SensitiveEvidenceRuleId =
  | (typeof highConfidenceRules)[number]["id"]
  | (typeof contextualRules)[number]["id"];

const publicContentFields = new Set([
  "content",
  "description",
  "originalAuthor",
  "originalContent",
  "originalPublisher",
  "originalTitle",
  "sourceMaterial",
  "summary",
  "title",
  "transcript",
]);

function maskPublicContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskPublicContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    publicContentFields.has(key) ? "[PUBLIC_CONTENT]" : maskPublicContent(child),
  ]));
}

function contextualScanBody(body: string) {
  try {
    return JSON.stringify(maskPublicContent(JSON.parse(body)));
  } catch {
    return body;
  }
}

export function sensitiveEvidenceRuleIds(body: string): SensitiveEvidenceRuleId[] {
  const contextualBody = contextualScanBody(body);
  return [
    ...highConfidenceRules.filter(({ pattern }) => pattern.test(body)).map(({ id }) => id),
    ...contextualRules.filter(({ pattern }) => pattern.test(contextualBody)).map(({ id }) => id),
  ];
}

export function sanitizeSensitiveFailureMessage(rawMessage: string) {
  return rawMessage
    .replace(/-----BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY-----[\s\S]*?-----END \1 PRIVATE KEY-----/giu, "[REDACTED PRIVATE KEY]")
    .replace(/Authorization\s*:\s*(Basic|Bearer)\s+\S+/giu, "Authorization: $1 [REDACTED]")
    .replace(/\b(postgresql(?:\+\w+)?):\/\/[^@\s]+@/giu, "$1://[REDACTED]@")
    .replace(/\b(https?):\/\/[^/@\s:]+:[^/@\s]+@/giu, "$1://[REDACTED]@")
    .replace(new RegExp(`([?&]${credentialName}=)[^&#\\s]+`, "giu"), "$1[REDACTED]")
    .replace(new RegExp(`(\\b${credentialName}\\b\\s*(?:=|:)\\s*["']?)[^\\s;,"']+`, "giu"), "$1[REDACTED]")
    .replace(/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/giu, "[REDACTED_EMAIL]")
    .replace(/\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|LTAI[A-Za-z0-9]{12,})\b/gu, "[REDACTED]")
    .replace(/\b(?:Set-Cookie|Cookie)\s*:\s*\S+/giu, "Cookie: [REDACTED]")
    .slice(0, 1_000);
}
