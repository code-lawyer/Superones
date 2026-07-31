import "server-only";

import { isIP } from "node:net";
import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
import { loadEditorialProfileConfig, type EditorialProfileId } from "./openai-compatible-client.ts";
import {
  ADMIN_ORIGIN,
  ICP_NUMBER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR_CREDIT_CODE,
  LEGAL_OPERATOR_LEGAL_REPRESENTATIVE,
  LEGAL_OPERATOR_REGISTERED_ADDRESS,
  LEGAL_OPERATOR_REGISTERED_CAPITAL,
  PUBLIC_ORIGIN,
} from "./legal-profile.ts";
import { opcAlipayConfigurationErrors } from "./opc-payment-config.ts";
import { parseSecretKeyring } from "./secret-keyring.ts";

export type ProductionConfigurationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    databaseHost: string | null;
    publicOrigin: string | null;
    adminOrigin: string | null;
    passkeyRpId: string | null;
    editorialProviders: Record<EditorialProfileId, string | null>;
    trustedProxyHeaders: boolean;
  };
};

const REQUIRED_SECRETS = [
  "VAULT2077_ADMIN_SESSION_SECRET",
  "VAULT2077_AUDIT_HASH_SECRET",
  "VAULT2077_PIPELINE_WORKER_SECRET",
  "VAULT2077_FRONTIER_TASKS_SECRET",
  "VAULT2077_FRONTIER_TICK_SECRET",
  "VAULT2077_HEALTH_SECRET",
] as const;

function validateKeyring(
  environment: Record<string, string | undefined>,
  serializedName: string,
  activeKeyIdName: string,
  legacyName: string,
  label: string,
  errors: string[],
): Array<{ name: string; value: string }> {
  const serialized = environment[serializedName]?.trim() ?? "";
  const activeKeyId = environment[activeKeyIdName]?.trim() ?? "";
  if (environment[legacyName]) {
    errors.push(`生产环境不得再使用单值密钥变量 ${legacyName}。`);
  }
  try {
    const keyring = parseSecretKeyring(serialized, activeKeyId, label);
    const entries = Array.from(keyring.keys, ([keyId, secret]) => ({
      name: `${serializedName}:${keyId}`,
      value: secret,
    }));
    for (const { value: secret } of entries) {
      if (placeholder(secret)) errors.push(`${serializedName} 含示例或开发占位值。`);
    }
    return entries;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${label} 配置无效。`);
    return [];
  }
}

function placeholder(value: string) {
  return /change-me|replace-with|example|local-development|local-admin|正式上线前填写/i.test(value);
}

function requiredPublicValue(
  environment: Record<string, string | undefined>,
  name: string,
  label: string,
  errors: string[],
) {
  const value = environment[name]?.trim() ?? "";
  if (!value || placeholder(value)) errors.push(`${name} 必须填写真实的${label}。`);
  return value;
}

function validEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
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

  if (!["true", "false"].includes(environment.VAULT2077_FRONTIER_WRITES_ENABLED ?? "")) {
    errors.push("VAULT2077_FRONTIER_WRITES_ENABLED 必须明确设为 true 或 false；每赛季奖励由管理后台发布。");
  }

  const icpNumber = environment.VAULT2077_ICP_NUMBER?.trim() ?? "";
  if (!icpNumber || placeholder(icpNumber) || !icpNumber.includes("ICP备")) {
    errors.push("VAULT2077_ICP_NUMBER 必须填写有效的 ICP 备案号。");
  } else if (icpNumber !== ICP_NUMBER) {
    errors.push(`VAULT2077_ICP_NUMBER 必须与已确认备案 ${ICP_NUMBER} 一致。`);
  }

  const creditCode = requiredPublicValue(
    environment,
    "VAULT2077_OPERATOR_CREDIT_CODE",
    "统一社会信用代码",
    errors,
  );
  if (creditCode && !placeholder(creditCode) && !/^[0-9A-Z]{18}$/.test(creditCode)) {
    errors.push("VAULT2077_OPERATOR_CREDIT_CODE 必须是 18 位统一社会信用代码。");
  } else if (creditCode && creditCode !== LEGAL_OPERATOR_CREDIT_CODE) {
    errors.push("VAULT2077_OPERATOR_CREDIT_CODE 必须与已确认营业执照一致。");
  }
  const registeredAddress = requiredPublicValue(
    environment,
    "VAULT2077_OPERATOR_REGISTERED_ADDRESS",
    "营业执照住所",
    errors,
  );
  if (registeredAddress && registeredAddress !== LEGAL_OPERATOR_REGISTERED_ADDRESS) {
    errors.push("VAULT2077_OPERATOR_REGISTERED_ADDRESS 必须与已确认营业执照一致。");
  }
  const legalRepresentative = requiredPublicValue(
    environment,
    "VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE",
    "法定代表人姓名",
    errors,
  );
  if (legalRepresentative && legalRepresentative !== LEGAL_OPERATOR_LEGAL_REPRESENTATIVE) {
    errors.push("VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE 必须与已确认营业执照一致。");
  }
  const registeredCapital = requiredPublicValue(
    environment,
    "VAULT2077_OPERATOR_REGISTERED_CAPITAL",
    "营业执照登记的注册资本",
    errors,
  );
  if (registeredCapital && registeredCapital !== LEGAL_OPERATOR_REGISTERED_CAPITAL) {
    errors.push("VAULT2077_OPERATOR_REGISTERED_CAPITAL 必须与已确认营业执照一致。");
  }
  const legalContactEmail = requiredPublicValue(
    environment,
    "VAULT2077_LEGAL_CONTACT_EMAIL",
    "法律与隐私联系邮箱",
    errors,
  );
  if (legalContactEmail && !placeholder(legalContactEmail) && !validEmail(legalContactEmail)) {
    errors.push("VAULT2077_LEGAL_CONTACT_EMAIL 必须是有效邮箱。");
  } else if (legalContactEmail && legalContactEmail.toLowerCase() !== LEGAL_CONTACT_EMAIL) {
    errors.push("VAULT2077_LEGAL_CONTACT_EMAIL 必须与已确认法律联系邮箱一致。");
  }
  const customerServiceEmail = environment.VAULT2077_CUSTOMER_SERVICE_EMAIL?.trim() ?? "";
  if (customerServiceEmail && !validEmail(customerServiceEmail)) {
    errors.push("VAULT2077_CUSTOMER_SERVICE_EMAIL 必须是有效邮箱。");
  }
  const legalEffectiveDate = requiredPublicValue(
    environment,
    "VAULT2077_LEGAL_EFFECTIVE_DATE",
    "法律文件生效日期",
    errors,
  );
  if (
    legalEffectiveDate
    && !placeholder(legalEffectiveDate)
    && !/^\d{4}-\d{2}-\d{2}$/.test(legalEffectiveDate)
  ) {
    errors.push("VAULT2077_LEGAL_EFFECTIVE_DATE 必须使用 YYYY-MM-DD。");
  } else if (legalEffectiveDate && legalEffectiveDate !== LEGAL_EFFECTIVE_DATE) {
    errors.push(`VAULT2077_LEGAL_EFFECTIVE_DATE 必须使用已确认日期 ${LEGAL_EFFECTIVE_DATE}。`);
  }

  if (!["true", "false"].includes(environment.VAULT2077_OPC_PAYMENTS_ENABLED ?? "")) {
    errors.push("VAULT2077_OPC_PAYMENTS_ENABLED 必须明确设为 true 或 false。");
  } else if (environment.VAULT2077_OPC_PAYMENTS_ENABLED === "true") {
    errors.push(...opcAlipayConfigurationErrors(environment, {
      productionGatewayOnly: true,
    }).map((error) => `支付宝开放平台：${error}`));
  }

  const configuredSecrets: Array<{ name: string; value: string }> = [];
  for (const name of REQUIRED_SECRETS) {
    const value = environment[name]?.trim() ?? "";
    if (Buffer.byteLength(value, "utf8") < 32) errors.push(`${name} 必须至少 32 字节。`);
    else if (placeholder(value)) errors.push(`${name} 仍含示例或开发占位值。`);
    if (value) configuredSecrets.push({ name, value });
  }
  configuredSecrets.push(...validateKeyring(
    environment,
    "VAULT2077_DATA_KEYS",
    "VAULT2077_DATA_ACTIVE_KEY_ID",
    "VAULT2077_DATA_KEY",
    "敏感数据密钥环",
    errors,
  ));
  configuredSecrets.push(...validateKeyring(
    environment,
    "VAULT2077_PIPELINE_SIGNING_KEYS",
    "VAULT2077_PIPELINE_ACTIVE_KEY_ID",
    "VAULT2077_PIPELINE_SHARED_SECRET",
    "统一采集签名密钥环",
    errors,
  ));
  const secretOwners = new Map<string, string>();
  for (const secret of configuredSecrets) {
    const existingOwner = secretOwners.get(secret.value);
    if (existingOwner) {
      errors.push(`${secret.name} 不得与 ${existingOwner} 复用同一密钥。`);
    } else {
      secretOwners.set(secret.value, secret.name);
    }
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
  if (publicOrigin && publicOrigin !== PUBLIC_ORIGIN) {
    errors.push(`VAULT2077_PUBLIC_ORIGIN 必须与已确认域名一致：${PUBLIC_ORIGIN}。`);
  }
  if (adminOrigin && adminOrigin !== ADMIN_ORIGIN) {
    errors.push(`VAULT2077_ADMIN_ORIGIN 必须使用独立后台域名：${ADMIN_ORIGIN}。`);
  }
  if (publicOrigin && adminOrigin && new URL(publicOrigin).host === new URL(adminOrigin).host) {
    errors.push("VAULT2077_ADMIN_ORIGIN 必须使用与公开站不同的独立主机。");
  }

  for (const retiredIdentityVariable of [
    "VAULT2077_ADMIN_OIDC_ISSUER",
    "VAULT2077_ADMIN_OIDC_DISCOVERY_URL",
    "VAULT2077_ADMIN_OIDC_CLIENT_ID",
    "VAULT2077_ADMIN_OIDC_CLIENT_SECRET",
    "VAULT2077_ADMIN_IDENTITY_ALLOWLIST",
  ]) {
    if (environment[retiredIdentityVariable]) {
      errors.push(`生产配置不得再使用已退役的 OIDC 变量 ${retiredIdentityVariable}；管理员身份固定为 ${PRODUCTION_ADMIN_EMAIL} 并由原生 Passkey 验证。`);
    }
  }
  const passkeyRpId = adminOrigin ? new URL(adminOrigin).hostname : null;

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
    "VAULT2077_SIC_LLM_CONCURRENCY",
    "VAULT2077_SIC_LLM_BATCH_ITEMS",
    "VAULT2077_ACQUISITION_MAX_RECORDS",
    "VAULT2077_ACQUISITION_MAX_ATTEMPTS",
    "VAULT2077_ACQUISITION_WORKER_MAX_BATCHES",
    "VAULT2077_DELIVERY_ATTEMPTS",
    "VAULT2077_DELIVERY_TIMEOUT_MS",
    "VAULT2077_DELIVERY_RETRY_BASE_MS",
  ]) {
    positiveInteger(environment, name, errors, 10_000);
  }
  positiveInteger(environment, "VAULT2077_ACQUISITION_RETRY_BASE_MS", errors, 21_600_000);

  for (const name of [
    "VAULT2077_VAULT_LLM_MAX_REQUESTS_PER_RUN",
    "VAULT2077_SIC_LLM_MAX_REQUESTS_PER_RUN",
  ]) {
    if (environment[name]?.trim().toLowerCase() !== "unlimited") {
      positiveInteger(environment, name, errors, 10_000);
    }
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
    errors.push("生产入口必须信任由标准 Nginx 模板覆盖写入的代理转发头。");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      databaseHost,
      publicOrigin,
      adminOrigin,
      passkeyRpId,
      editorialProviders,
      trustedProxyHeaders: environment.VAULT2077_TRUST_PROXY_HEADERS === "true",
    },
  };
}
