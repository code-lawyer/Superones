const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type SecretKeyring = {
  activeKeyId: string;
  keys: ReadonlyMap<string, string>;
};

function assertSecret(keyId: string, secret: unknown, label: string) {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(`${label} 的密钥 ID 只能包含字母、数字、下划线和连字符，且不超过 64 字符。`);
  }
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(`${label} 的密钥 ${keyId} 必须至少 32 字节。`);
  }
}

export function parseSecretKeyring(
  serialized: string,
  activeKeyId: string,
  label: string,
): SecretKeyring {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error(`${label} 必须是 JSON 对象。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象。`);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) {
    throw new Error(`${label} 必须包含 1-8 把密钥。`);
  }
  const keys = new Map<string, string>();
  for (const [keyId, secret] of entries) {
    assertSecret(keyId, secret, label);
    keys.set(keyId, secret as string);
  }
  if (!KEY_ID_PATTERN.test(activeKeyId) || !keys.has(activeKeyId)) {
    throw new Error(`${label} 的活动密钥 ID 未出现在密钥环中。`);
  }
  return { activeKeyId, keys };
}

export function loadSecretKeyring(input: {
  environment?: Record<string, string | undefined>;
  serializedName: string;
  activeKeyIdName: string;
  legacyName?: string;
  developmentFallback?: string;
  label: string;
}): SecretKeyring {
  const environment = input.environment ?? process.env;
  const serialized = environment[input.serializedName]?.trim();
  const activeKeyId = environment[input.activeKeyIdName]?.trim();
  if (serialized || activeKeyId) {
    if (!serialized || !activeKeyId) {
      throw new Error(`${input.serializedName} 与 ${input.activeKeyIdName} 必须同时配置。`);
    }
    return parseSecretKeyring(serialized, activeKeyId, input.label);
  }

  const legacy = input.legacyName ? environment[input.legacyName]?.trim() : "";
  if (legacy && environment.NODE_ENV === "production") {
    throw new Error(`生产环境不得使用旧单值密钥变量 ${input.legacyName}。`);
  }
  const fallback = legacy || (environment.NODE_ENV === "production" ? "" : input.developmentFallback);
  if (!fallback) {
    throw new Error(`${input.serializedName} 与 ${input.activeKeyIdName} 未配置。`);
  }
  assertSecret("legacy", fallback, input.label);
  return { activeKeyId: "legacy", keys: new Map([["legacy", fallback]]) };
}

export function pipelineSigningKeyring(
  environment: Record<string, string | undefined> = process.env,
) {
  return loadSecretKeyring({
    environment,
    serializedName: "VAULT2077_PIPELINE_SIGNING_KEYS",
    activeKeyIdName: "VAULT2077_PIPELINE_ACTIVE_KEY_ID",
    legacyName: "VAULT2077_PIPELINE_SHARED_SECRET",
    developmentFallback: "vault2077-local-pipeline-secret!",
    label: "统一采集签名密钥环",
  });
}

export function sensitiveDataKeyring(
  environment: Record<string, string | undefined> = process.env,
) {
  return loadSecretKeyring({
    environment,
    serializedName: "VAULT2077_DATA_KEYS",
    activeKeyIdName: "VAULT2077_DATA_ACTIVE_KEY_ID",
    legacyName: "VAULT2077_DATA_KEY",
    developmentFallback: "vault2077-local-data-key-development!",
    label: "敏感数据密钥环",
  });
}

export function opcResumeTokenKeyring(
  environment: Record<string, string | undefined> = process.env,
) {
  return loadSecretKeyring({
    environment,
    serializedName: "VAULT2077_OPC_RESUME_TOKEN_KEYS",
    activeKeyIdName: "VAULT2077_OPC_RESUME_TOKEN_ACTIVE_KEY_ID",
    developmentFallback: "vault2077-local-opc-resume-token-key!",
    label: "OPC 订单恢复令牌密钥环",
  });
}
