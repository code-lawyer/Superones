import "server-only";

import { isIP } from "node:net";
import { loadEditorialProfileConfig, type EditorialProfileId } from "./openai-compatible-client.ts";

export type ProductionConfigurationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    databaseHost: string | null;
    publicOrigin: string | null;
    adminOrigin: string | null;
    identityIssuer: string | null;
    editorialProviders: Record<EditorialProfileId, string | null>;
    trustedProxyHeaders: boolean;
  };
};

const REQUIRED_SECRETS = [
  "VAULT2077_DATA_KEY",
  "VAULT2077_ADMIN_SESSION_SECRET",
  "VAULT2077_AUDIT_HASH_SECRET",
  "VAULT2077_PIPELINE_SHARED_SECRET",
  "VAULT2077_PIPELINE_WORKER_SECRET",
  "VAULT2077_FRONTIER_TICK_SECRET",
  "VAULT2077_HEALTH_SECRET",
] as const;

function placeholder(value: string) {
  return /change-me|replace-with|example|local-development|local-admin/i.test(value);
}

function positiveInteger(
  environment: Record<string, string | undefined>,
  name: string,
  errors: string[],
  maximum: number,
) {
  const value = environment[name];
  if (value === undefined || value === "") return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    errors.push(`${name} 必须是 1-${maximum} 的整数。`);
  }
}

function providerHost(
  profile: EditorialProfileId,
  environment: Record<string, string | undefined>,
  errors: string[],
) {
  try {
    const config = loadEditorialProfileConfig(profile, environment);
    const url = new URL(config.primary.baseUrl);
    if (url.protocol !== "https:") errors.push(`${profile} 的主处理地址必须使用 HTTPS。`);
    if (config.fallback) {
      const fallbackUrl = new URL(config.fallback.baseUrl);
      if (fallbackUrl.protocol !== "https:") errors.push(`${profile} 的备用处理地址必须使用 HTTPS。`);
    }
    return url.hostname;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${profile} 配置无效。`);
    return null;
  }
}

function parseHttpsOrigin(
  environment: Record<string, string | undefined>,
  name: string,
  errors: string[],
) {
  const value = environment[name]?.trim() ?? "";
  if (!value) {
    errors.push(`${name} 未配置。`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.origin !== value.replace(/\/$/, "")) {
      errors.push(`${name} 必须是不带路径的 HTTPS origin。`);
    }
    if (isIP(parsed.hostname)) errors.push(`${name} 必须使用域名，不能使用服务器 IP。`);
    if (placeholder(value)) errors.push(`${name} 仍含示例占位值。`);
    return parsed.origin;
  } catch {
    errors.push(`${name} 不是有效 URL。`);
    return null;
  }
}

function parseHttpsUrl(
  environment: Record<string, string | undefined>,
  name: string,
  errors: string[],
) {
  const value = environment[name]?.trim() ?? "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") errors.push(`${name} 必须使用 HTTPS。`);
    if (placeholder(value)) errors.push(`${name} 仍含示例占位值。`);
    return parsed;
  } catch {
    errors.push(`${name} 不是有效 URL。`);
    return null;
  }
}

export function validateProductionConfiguration(
  environment: Record<string, string | undefined> = process.env,
): ProductionConfigurationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  let databaseHost: string | null = null;

  if (environment.NODE_ENV !== "production") {
    errors.push("NODE_ENV 必须是 production。");
  }

  const databaseUrl = environment.VAULT2077_DATABASE_URL || environment.DATABASE_URL;
  if (!databaseUrl) {
    errors.push("VAULT2077_DATABASE_URL 未配置。");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        errors.push("VAULT2077_DATABASE_URL 必须使用 PostgreSQL。");
      }
      if (!parsed.username || !parsed.hostname || !parsed.pathname.slice(1)) {
        errors.push("VAULT2077_DATABASE_URL 必须包含用户、主机和数据库名。");
      }
      if (placeholder(databaseUrl)) errors.push("VAULT2077_DATABASE_URL 仍含示例占位值。");
      databaseHost = parsed.hostname || null;
    } catch {
      errors.push("VAULT2077_DATABASE_URL 不是有效 URL。");
    }
  }
  if ((environment.VAULT2077_DATABASE_SSL ?? "require") === "disable") {
    errors.push("生产数据库连接不得关闭 TLS。");
  }
  positiveInteger(environment, "VAULT2077_DATABASE_POOL_SIZE", errors, 100);

  if (environment.VAULT2077_ALLOW_FILE_PREVIEW === "true") {
    errors.push("生产环境不得启用 VAULT2077_ALLOW_FILE_PREVIEW。");
  }

  for (const name of REQUIRED_SECRETS) {
    const value = environment[name]?.trim() ?? "";
    if (Buffer.byteLength(value, "utf8") < 32) errors.push(`${name} 必须至少 32 字节。`);
    else if (placeholder(value)) errors.push(`${name} 仍含示例或开发占位值。`);
  }

  for (const localCredential of [
    "VAULT2077_ADMIN_PASSWORD",
    "VAULT2077_ADMIN_PASSWORD_HASH",
  ]) {
    if (environment[localCredential]) {
      errors.push(`生产环境不得配置本地密码变量 ${localCredential}。`);
    }
  }

  const publicOrigin = parseHttpsOrigin(environment, "VAULT2077_PUBLIC_ORIGIN", errors);
  const adminOrigin = parseHttpsOrigin(environment, "VAULT2077_ADMIN_ORIGIN", errors);
  if (publicOrigin && adminOrigin && new URL(publicOrigin).host === new URL(adminOrigin).host) {
    errors.push("VAULT2077_ADMIN_ORIGIN 必须使用与公开站不同的独立主机。");
  }

  const identityIssuerUrl = parseHttpsUrl(
    environment,
    "VAULT2077_ADMIN_IDENTITY_ISSUER",
    errors,
  );
  const identityIssuer = identityIssuerUrl?.origin ?? null;
  const audience = environment.VAULT2077_ADMIN_IDENTITY_AUDIENCE?.trim() ?? "";
  if (!audience || placeholder(audience)) {
    errors.push("VAULT2077_ADMIN_IDENTITY_AUDIENCE 未配置或仍是占位值。");
  }
  parseHttpsUrl(environment, "VAULT2077_ADMIN_IDENTITY_JWKS_URL", errors);
  const identityHeader = (environment.VAULT2077_ADMIN_IDENTITY_HEADER ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(identityHeader)) {
    errors.push("VAULT2077_ADMIN_IDENTITY_HEADER 必须是明确的 HTTP 请求头名。");
  }
  const allowlist = (environment.VAULT2077_ADMIN_IDENTITY_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0 || allowlist.some((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) {
    errors.push("VAULT2077_ADMIN_IDENTITY_ALLOWLIST 必须包含至少一个有效管理员邮箱。");
  }
  if (new Set(allowlist).size !== allowlist.length) {
    errors.push("VAULT2077_ADMIN_IDENTITY_ALLOWLIST 不得包含重复邮箱。");
  }
  const reauthenticationUrl = parseHttpsUrl(
    environment,
    "VAULT2077_ADMIN_REAUTH_URL",
    errors,
  );
  if (adminOrigin && reauthenticationUrl && reauthenticationUrl.origin !== adminOrigin) {
    errors.push("VAULT2077_ADMIN_REAUTH_URL 必须属于管理 origin。");
  }

  const githubToken = environment.GITHUB_TOKEN?.trim() ?? "";
  if (githubToken.length < 20 || placeholder(githubToken)) {
    errors.push("GITHUB_TOKEN 必须配置为服务端只读生产凭证。");
  }

  const editorialProviders = {
    vault_editorial: providerHost("vault_editorial", environment, errors),
    sic_editorial: providerHost("sic_editorial", environment, errors),
  };
  if (
    editorialProviders.vault_editorial
    && editorialProviders.vault_editorial === editorialProviders.sic_editorial
  ) {
    warnings.push("Vault 与 SiC 当前使用同一提供方主机；可运行，但失去栏目级供应商故障隔离。");
  }

  for (const name of [
    "VAULT2077_VAULT_LLM_CONCURRENCY",
    "VAULT2077_VAULT_LLM_BATCH_ITEMS",
    "VAULT2077_VAULT_LLM_MAX_REQUESTS_PER_RUN",
    "VAULT2077_SIC_LLM_CONCURRENCY",
    "VAULT2077_SIC_LLM_BATCH_ITEMS",
    "VAULT2077_SIC_LLM_MAX_REQUESTS_PER_RUN",
    "VAULT2077_ACQUISITION_MAX_RECORDS",
    "VAULT2077_ACQUISITION_MAX_ATTEMPTS",
  ]) {
    positiveInteger(environment, name, errors, 10_000);
  }

  for (const legacy of [
    "VAULT2077_LLM_BASE_URL",
    "VAULT2077_LLM_API_KEY",
    "VAULT2077_LLM_MODEL",
  ]) {
    if (environment[legacy]) errors.push(`生产配置不得再使用旧共享变量 ${legacy}。`);
  }

  if (
    environment.VAULT2077_TRUST_PROXY_HEADERS !== undefined
    && !["true", "false"].includes(environment.VAULT2077_TRUST_PROXY_HEADERS)
  ) {
    errors.push("VAULT2077_TRUST_PROXY_HEADERS 只能是 true 或 false。");
  }
  if (environment.VAULT2077_TRUST_PROXY_HEADERS !== "true") {
    warnings.push("未信任代理转发头；所有未知公网客户端将共享保守限额，部署代理后应按手册确认。");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      databaseHost,
      publicOrigin,
      adminOrigin,
      identityIssuer,
      editorialProviders,
      trustedProxyHeaders: environment.VAULT2077_TRUST_PROXY_HEADERS === "true",
    },
  };
}
