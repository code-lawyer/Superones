import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { LEGAL_OPERATOR_NAME } from "./legal-profile.ts";
import { isOfficialEsignUrl } from "./opc-esign-url.ts";

export const OPC_SIGNER_PARTY_TYPES = ["individual", "organization"] as const;
export type OpcSignerPartyType = (typeof OPC_SIGNER_PARTY_TYPES)[number];

export type OpcSignerParty = {
  type: OpcSignerPartyType;
  name: string;
  phone: string;
  organizationName: string;
  organizationCreditCode: string;
  legalRepresentativeName: string;
};

export type OpcEsignTemplateFields = Record<
  | "order_reference"
  | "service_code"
  | "service_name"
  | "service_revision"
  | "quoted_price"
  | "service_period"
  | "service_outcome"
  | "service_scope"
  | "service_boundary"
  | "provider_name"
  | "provider_credit_code"
  | "customer_name"
  | "customer_phone"
  | "customer_org_name"
  | "customer_org_credit_code"
  | "customer_legal_representative",
  string
>;

type OpcEsignConfiguration = {
  provider: "mock" | "esign";
  publicOrigin: string;
  appId: string;
  appSecret: string;
  apiBaseUrl: string;
  individualTemplateId: string;
  organizationTemplateId: string;
  templateVersion: string;
  providerSealId: string;
  providerIndividualSignPosition: OpcSignPosition;
  providerOrganizationSignPosition: OpcSignPosition;
};

export type OpcEsignTemplateProbe = {
  kind: "individual" | "organization";
  templateName: string;
  componentCount: number;
  status: "ok";
};

type OpcSignPosition = { positionPage: string; positionX: number; positionY: number };

function parseSignPosition(value: string | undefined, label: string): OpcSignPosition {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<OpcSignPosition>;
    if (!/^\d{1,4}$/.test(parsed.positionPage ?? "") || !Number.isFinite(parsed.positionX) || !Number.isFinite(parsed.positionY)) throw new Error();
    if (parsed.positionX! < 0 || parsed.positionY! < 0 || parsed.positionX! > 10_000 || parsed.positionY! > 10_000) throw new Error();
    return { positionPage: parsed.positionPage!, positionX: parsed.positionX!, positionY: parsed.positionY! };
  } catch {
    throw new Error(`e 签宝${label}签章坐标配置无效。`);
  }
}

export type OpcEsignFlowStatus = "awaiting_signer" | "completed" | "rejected" | "expired" | "revoked" | "failed";

export type OpcEsignCreatedFlow = {
  provider: "mock" | "esign";
  flowId: string;
  fileId: string;
  templateId: string;
  templateVersion: string;
};

export type OpcEsignFlowVerification = {
  status: OpcEsignFlowStatus;
  fullySigned: boolean;
  signerCount: number;
};

export type OpcEsignVerifiedContract = {
  pdf: Buffer;
  sha256: string;
  verifiedAt: string;
  signerCount: number;
  evidence: Array<{ fileHash: string; transactionId: string; transactionHash: string }>;
};

function normalizedOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new Error("电子签约公开来源必须使用 HTTPS。");
  }
  return url.origin;
}

function readConfiguration(environment: Record<string, string | undefined>): OpcEsignConfiguration {
  const provider = environment.VAULT2077_OPC_ESIGN_PROVIDER === "esign" ? "esign" : "mock";
  if (environment.NODE_ENV === "production" && provider !== "esign") {
    throw new Error("生产环境电子签约必须使用 e 签宝供应商。");
  }
  const publicOrigin = normalizedOrigin(environment.VAULT2077_PUBLIC_ORIGIN?.trim() || "http://localhost:3000");
  if (provider === "mock") {
    return {
      provider,
      publicOrigin,
      appId: "",
      appSecret: "",
      apiBaseUrl: "",
      individualTemplateId: "mock-individual",
      organizationTemplateId: "mock-organization",
      templateVersion: "development",
      providerSealId: "",
      providerIndividualSignPosition: { positionPage: "1", positionX: 0, positionY: 0 },
      providerOrganizationSignPosition: { positionPage: "1", positionX: 0, positionY: 0 },
    };
  }
  const configuration = {
    provider,
    publicOrigin,
    appId: environment.VAULT2077_ESIGN_APP_ID?.trim() ?? "",
    appSecret: environment.VAULT2077_ESIGN_APP_SECRET?.trim() ?? "",
    apiBaseUrl: environment.VAULT2077_ESIGN_API_BASE_URL?.trim().replace(/\/$/, "") ?? "",
    individualTemplateId: environment.VAULT2077_ESIGN_INDIVIDUAL_TEMPLATE_ID?.trim() ?? "",
    organizationTemplateId: environment.VAULT2077_ESIGN_ORGANIZATION_TEMPLATE_ID?.trim() ?? "",
    templateVersion: environment.VAULT2077_ESIGN_TEMPLATE_VERSION?.trim() ?? "",
    providerSealId: environment.VAULT2077_ESIGN_PROVIDER_SEAL_ID?.trim() ?? "",
    providerIndividualSignPosition: parseSignPosition(environment.VAULT2077_ESIGN_INDIVIDUAL_PROVIDER_SIGN_POSITION, "自然人模板平台方"),
    providerOrganizationSignPosition: parseSignPosition(environment.VAULT2077_ESIGN_ORGANIZATION_PROVIDER_SIGN_POSITION, "组织模板平台方"),
  } satisfies OpcEsignConfiguration;
  if (!/^\d{8,32}$/.test(configuration.appId)) throw new Error("e 签宝 AppID 配置无效。");
  if (configuration.appSecret.length < 16) throw new Error("e 签宝 AppSecret 配置无效。");
  const apiUrl = new URL(configuration.apiBaseUrl);
  const allowedHosts = new Set(["smlopenapi.esign.cn", "openapi.esign.cn"]);
  if (apiUrl.protocol !== "https:" || !allowedHosts.has(apiUrl.hostname) || apiUrl.pathname !== "/") {
    throw new Error("e 签宝 API 地址必须使用官方 HTTPS 根地址。");
  }
  if (environment.NODE_ENV === "production" && apiUrl.hostname !== "openapi.esign.cn") {
    throw new Error("生产环境不能使用 e 签宝沙箱地址。");
  }
  for (const [label, value] of [
    ["自然人模板 ID", configuration.individualTemplateId],
    ["组织模板 ID", configuration.organizationTemplateId],
    ["模板版本", configuration.templateVersion],
  ]) {
    if (!value || value.length > 128) throw new Error(`e 签宝${label}配置无效。`);
  }
  return configuration;
}

export function readOpcEsignConfiguration(environment: Record<string, string | undefined> = process.env) {
  const enabled = environment.NODE_ENV === "production"
    ? environment.VAULT2077_OPC_ESIGN_ENABLED === "true"
    : environment.VAULT2077_OPC_ESIGN_ENABLED !== "false";
  if (!enabled) return null;
  try {
    return readConfiguration(environment);
  } catch {
    return null;
  }
}

export function requireOpcEsignConfiguration() {
  const configuration = readOpcEsignConfiguration();
  if (!configuration) throw new Error("电子签约服务尚未完成配置，当前不能创建订单。");
  return configuration;
}

export function opcEsignConfigurationErrors(environment: Record<string, string | undefined> = process.env) {
  try {
    const enabled = environment.NODE_ENV === "production"
      ? environment.VAULT2077_OPC_ESIGN_ENABLED === "true"
      : environment.VAULT2077_OPC_ESIGN_ENABLED !== "false";
    if (!enabled) return [];
    readConfiguration(environment);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "电子签约配置无效。"];
  }
}

function contentMd5(body: string) {
  return body ? createHash("md5").update(body).digest("base64") : "";
}

function signedHeaders(method: string, path: string, body: string, configuration: OpcEsignConfiguration) {
  const timestamp = String(Date.now());
  const md5 = contentMd5(body);
  const contentType = body ? "application/json; charset=UTF-8" : "";
  const canonical = `${method}\n*/*\n${md5}\n${contentType}\n\n${path}`;
  return {
    Accept: "*/*",
    ...(contentType ? { "Content-Type": contentType, "Content-MD5": md5 } : {}),
    "X-Tsign-Open-App-Id": configuration.appId,
    "X-Tsign-Open-Auth-Mode": "Signature",
    "X-Tsign-Open-Ca-Timestamp": timestamp,
    "X-Tsign-Open-Ca-Signature": createHmac("sha256", configuration.appSecret).update(canonical).digest("base64"),
  };
}

async function esignRequest(method: "GET" | "POST", path: string, payload: unknown, configuration: OpcEsignConfiguration) {
  return esignRequestWith(method, path, payload, configuration, fetch);
}

async function esignRequestWith(
  method: "GET" | "POST",
  path: string,
  payload: unknown,
  configuration: OpcEsignConfiguration,
  fetcher: typeof fetch,
) {
  const body = method === "POST" ? JSON.stringify(payload) : "";
  const response = await fetcher(`${configuration.apiBaseUrl}${path}`, {
    method,
    headers: signedHeaders(method, path, body, configuration),
    body: body || undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as { code?: unknown; message?: unknown; data?: Record<string, unknown> } | null;
  if (!response.ok || String(result?.code ?? "") !== "0" || !result?.data) {
    console.error("OPC e-sign request failed", { path, status: response.status, code: result?.code ?? "UNKNOWN" });
    throw new Error("电子签约服务暂时不可用。");
  }
  return result.data;
}

const requiredOpcTemplateComponentKeys = [
  "order_reference",
  "service_code",
  "service_name",
  "service_revision",
  "quoted_price",
  "service_period",
  "service_outcome",
  "service_scope",
  "service_boundary",
  "provider_name",
  "provider_credit_code",
  "customer_name",
  "customer_phone",
  "customer_org_name",
  "customer_org_credit_code",
  "customer_legal_representative",
] as const satisfies ReadonlyArray<keyof OpcEsignTemplateFields>;

export async function verifyOpcEsignTemplates(
  environment: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const configuration = readConfiguration(environment);
  if (configuration.provider !== "esign") {
    throw new Error("E 签宝模板探针必须使用真实的 e 签宝供应商配置。");
  }
  const templates = [
    ["individual", configuration.individualTemplateId],
    ["organization", configuration.organizationTemplateId],
  ] as const;
  const probes: OpcEsignTemplateProbe[] = [];
  for (const [kind, templateId] of templates) {
    const data = await esignRequestWith(
      "GET",
      `/v3/doc-templates/${encodeURIComponent(templateId)}`,
      null,
      configuration,
      fetcher,
    );
    if (String(data.docTemplateId ?? "") !== templateId) {
      throw new Error(`E 签宝${kind === "individual" ? "自然人" : "组织"}模板编号与查询结果不一致。`);
    }
    const components = Array.isArray(data.components)
      ? data.components as Array<Record<string, unknown>>
      : [];
    const componentKeys = components
      .map((component) => String(component.componentKey ?? ""))
      .filter(Boolean);
    const duplicates = componentKeys.filter((key, index) => componentKeys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      throw new Error(`E 签宝${kind === "individual" ? "自然人" : "组织"}模板含重复控件 Key：${[...new Set(duplicates)].join("、")}。`);
    }
    const missing = requiredOpcTemplateComponentKeys.filter((key) => !componentKeys.includes(key));
    if (missing.length > 0) {
      throw new Error(`E 签宝${kind === "individual" ? "自然人" : "组织"}模板缺少控件 Key：${missing.join("、")}。`);
    }
    const unknownRequired = components.filter((component) => (
      component.required === true
      && ![6, 17, 21].includes(Number(component.componentType))
      && !requiredOpcTemplateComponentKeys.includes(String(component.componentKey ?? "") as keyof OpcEsignTemplateFields)
    ));
    if (unknownRequired.length > 0) {
      throw new Error(`E 签宝${kind === "individual" ? "自然人" : "组织"}模板含代码不会填充的必填控件。`);
    }
    probes.push({
      kind,
      templateName: String(data.docTemplateName ?? "未命名模板").slice(0, 128),
      componentCount: components.length,
      status: "ok",
    });
  }
  return probes;
}

export async function createOpcEsignFlow(input: {
  reference: string;
  resumeToken: string;
  party: OpcSignerParty;
  fields: OpcEsignTemplateFields;
}) : Promise<OpcEsignCreatedFlow> {
  const configuration = requireOpcEsignConfiguration();
  const templateId = input.party.type === "organization"
    ? configuration.organizationTemplateId
    : configuration.individualTemplateId;
  if (configuration.provider === "mock") {
    return {
      provider: "mock",
      flowId: `mock-${input.reference}`,
      fileId: `mock-file-${input.reference}`,
      templateId,
      templateVersion: configuration.templateVersion,
    };
  }
  const fileData = await esignRequest("POST", "/v3/files/create-by-doc-template", {
    docTemplateId: templateId,
    fileName: `${input.reference}-OPC服务协议.pdf`,
    components: Object.entries(input.fields).map(([componentKey, componentValue]) => ({ componentKey, componentValue })),
  }, configuration);
  const fileId = String(fileData.fileId ?? "");
  if (!fileId) throw new Error("电子签约模板未生成有效文件。");
  const flowData = await esignRequest("POST", "/v3/sign-flow/create-by-file", {
    docs: [{ fileId, fileName: `${input.reference}-OPC服务协议.pdf` }],
    signFlowConfig: {
      signFlowTitle: `${input.reference} OPC服务协议`,
      autoStart: true,
      autoFinish: true,
      identityVerify: true,
      notifyUrl: `${configuration.publicOrigin}/api/opc/esign/callback`,
      redirectConfig: {
        redirectUrl: `${configuration.publicOrigin}/opc/sign/return?order=${encodeURIComponent(input.reference)}&token=${encodeURIComponent(input.resumeToken)}`,
      },
      signConfig: { availableSignClientTypes: "1", showBatchDropSealButton: false },
      authConfig: {
        willingnessAuthModes: ["CODE_SMS"],
        ...(input.party.type === "organization" ? { orgAvailableAuthModes: ["ORG_LEGALREP"] } : {}),
      },
    },
    signers: [{
      signerType: input.party.type === "organization" ? 1 : 0,
      signConfig: { signOrder: 1 },
      ...(input.party.type === "organization"
        ? {
            orgSignerInfo: {
              orgName: input.party.organizationName,
              orgInfo: { orgIDCardNum: input.party.organizationCreditCode, orgIDCardType: "CRED_ORG_USCC" },
              transactorInfo: { psnAccount: input.party.phone, psnInfo: { psnName: input.party.legalRepresentativeName } },
            },
          }
        : { psnSignerInfo: { psnAccount: input.party.phone, psnInfo: { psnName: input.party.name } } }),
      signFields: [{
        fileId,
        customBizNum: input.reference,
        signFieldType: 0,
        normalSignFieldConfig: { autoSign: false, freeMode: true },
      }],
    }, {
      signerType: 1,
      signConfig: { signOrder: 2 },
      orgSignerInfo: { orgName: LEGAL_OPERATOR_NAME },
      signFields: [{
        fileId,
        customBizNum: `${input.reference}-provider`,
        signFieldType: 0,
        normalSignFieldConfig: {
          autoSign: true,
          freeMode: false,
          signFieldStyle: 1,
          ...(configuration.providerSealId ? { assignedSealId: configuration.providerSealId } : {}),
          signFieldPosition: input.party.type === "organization"
            ? configuration.providerOrganizationSignPosition
            : configuration.providerIndividualSignPosition,
        },
      }],
    }],
  }, configuration);
  const flowId = String(flowData.signFlowId ?? "");
  if (!flowId) throw new Error("电子签约服务未返回签署流程编号。");
  return { provider: "esign", flowId, fileId, templateId, templateVersion: configuration.templateVersion };
}

function normalizedFlowStatus(data: Record<string, unknown>): OpcEsignFlowStatus {
  const raw = String(data.signFlowStatus ?? data.status ?? "").toUpperCase();
  if (["2", "SIGN_FLOW_FINISHED", "FINISHED", "COMPLETED"].includes(raw)) return "completed";
  if (["3", "SIGN_FLOW_REVOKED", "REVOKED"].includes(raw)) return "revoked";
  if (["5", "SIGN_FLOW_EXPIRED", "EXPIRED"].includes(raw)) return "expired";
  if (["7", "SIGN_FLOW_REJECTED", "REJECTED"].includes(raw)) return "rejected";
  if (["-1", "FAILED"].includes(raw)) return "failed";
  return "awaiting_signer";
}

function completedStatus(value: unknown) {
  return ["2", "SIGN_FINISHED", "FINISHED", "COMPLETED"].includes(String(value ?? "").toUpperCase());
}

export async function queryOpcEsignFlow(flowId: string): Promise<OpcEsignFlowVerification> {
  const configuration = requireOpcEsignConfiguration();
  if (configuration.provider === "mock") return { status: "awaiting_signer", fullySigned: false, signerCount: 0 };
  const data = await esignRequest("GET", `/v3/sign-flow/${encodeURIComponent(flowId)}/detail`, null, configuration);
  const status = normalizedFlowStatus(data);
  const signers = Array.isArray(data.signers) ? data.signers as Array<Record<string, unknown>> : [];
  const everySignerComplete = signers.length >= 2 && signers.every((signer) => {
    if (!completedStatus(signer.signStatus ?? signer.status)) return false;
    const fields = Array.isArray(signer.signFields) ? signer.signFields as Array<Record<string, unknown>> : [];
    return fields.length === 0 || fields.every((field) => completedStatus(field.signFieldStatus ?? field.status));
  });
  return {
    status: status === "completed" && !everySignerComplete ? "awaiting_signer" : status,
    fullySigned: status === "completed" && everySignerComplete,
    signerCount: signers.length,
  };
}

function allowedProviderDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" && (
      host === "esign.cn"
      || host.endsWith(".esign.cn")
      || host.endsWith(".aliyuncs.com")
    );
  } catch {
    return false;
  }
}

async function readBoundedPdf(url: string) {
  if (!allowedProviderDownloadUrl(url)) throw new Error("e 签宝合同下载地址未通过域名校验。");
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("e 签宝已签合同下载失败。");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 60 * 1024 * 1024) throw new Error("e 签宝已签合同超过归档大小限制。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 8 || bytes.length > 60 * 1024 * 1024 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("e 签宝返回的已签文件不是有效且大小受控的 PDF。");
  }
  return bytes;
}

export async function downloadAndVerifyOpcEsignContract(
  flowId: string,
  fileId: string,
  signerCount: number,
): Promise<OpcEsignVerifiedContract> {
  const configuration = requireOpcEsignConfiguration();
  if (configuration.provider === "mock") throw new Error("模拟签署不调用 e 签宝验签接口。");
  const downloadData = await esignRequest(
    "POST",
    `/v3/sign-flow/${encodeURIComponent(flowId)}/file-download-url`,
    { urlAvailableDate: 300 },
    configuration,
  );
  const candidates = [
    ...(Array.isArray(downloadData.files) ? downloadData.files : []),
    ...(Array.isArray(downloadData.fileDownloadUrls) ? downloadData.fileDownloadUrls : []),
    ...(Array.isArray(downloadData.docs) ? downloadData.docs : []),
  ] as Array<Record<string, unknown>>;
  const selected = candidates.find((item) => String(item.fileId ?? "") === fileId) ?? candidates[0];
  const downloadUrl = String(selected?.downloadUrl ?? selected?.url ?? downloadData.downloadUrl ?? "");
  const pdf = await readBoundedPdf(downloadUrl);
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const verifyData = await esignRequest(
    "POST",
    `/v3/files/${encodeURIComponent(fileId)}/verify`,
    { signFlowId: flowId, async: false },
    configuration,
  );
  const signInfos = Array.isArray(verifyData.signInfos) ? verifyData.signInfos as Array<Record<string, unknown>> : [];
  const unchanged = signInfos.length >= signerCount && signInfos.every((info) => {
    const signature = info.signature as Record<string, unknown> | undefined;
    return signature?.modify === false;
  });
  if (signerCount < 2 || !unchanged) throw new Error("e 签宝合同验签未确认双方签署完整且文件未被修改。");
  let evidence: OpcEsignVerifiedContract["evidence"] = [];
  try {
    const evidenceData = await esignRequest("POST", "/v3/antchain-file-info", { signFlowId: flowId }, configuration);
    const records = Array.isArray(evidenceData.antchainFiles) ? evidenceData.antchainFiles as Array<Record<string, unknown>> : [];
    evidence = records.map((record) => ({
      fileHash: String(record.fileHash ?? ""),
      transactionId: String(record.antTransactionId ?? ""),
      transactionHash: String(record.antTxHash ?? ""),
    })).filter((record) => record.fileHash || record.transactionId || record.transactionHash);
  } catch {
    // 区块链存证属于补充证据；PDF 验签与私有归档仍是付款前的硬门禁。
  }
  return { pdf, sha256, verifiedAt: new Date().toISOString(), signerCount, evidence };
}

export async function getOpcEsignSignUrl(flowId: string, reference: string, resumeToken: string, party: OpcSignerParty) {
  const configuration = requireOpcEsignConfiguration();
  const redirectUrl = `${configuration.publicOrigin}/opc/sign/return?order=${encodeURIComponent(reference)}&token=${encodeURIComponent(resumeToken)}`;
  if (configuration.provider === "mock") {
    return `${configuration.publicOrigin}/opc/sign/mock?order=${encodeURIComponent(reference)}&token=${encodeURIComponent(resumeToken)}`;
  }
  const data = await esignRequest("POST", `/v3/sign-flow/${encodeURIComponent(flowId)}/sign-url`, {
    needLogin: false,
    urlType: 2,
    operator: { psnAccount: party.phone },
    ...(party.type === "organization" ? { organization: { orgName: party.organizationName } } : {}),
    redirectConfig: { redirectUrl, redirectDelayTime: 3 },
    clientType: "ALL",
  }, configuration);
  const signUrl = String(data.url ?? data.signUrl ?? "");
  if (!isOfficialEsignUrl(signUrl)) throw new Error("电子签约页面地址无效。");
  return signUrl;
}

export function verifyOpcEsignCallback(rawBody: string, headers: Headers) {
  const configuration = requireOpcEsignConfiguration();
  if (configuration.provider === "mock") throw new Error("模拟签署不接收供应商回调。");
  const appId = headers.get("x-tsign-open-app-id") ?? "";
  const timestamp = headers.get("x-tsign-open-timestamp") ?? "";
  const algorithm = headers.get("x-tsign-open-signature-algorithm")?.toLowerCase() ?? "";
  const signature = headers.get("x-tsign-open-signature")?.toLowerCase() ?? "";
  if (appId !== configuration.appId || algorithm !== "hmac-sha256" || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 15 * 60_000) {
    throw new Error("电子签约回调身份或时间戳无效。");
  }
  const candidates = [createHmac("sha256", configuration.appSecret).update(`${timestamp}${rawBody}`).digest("hex")];
  const supplied = Buffer.from(signature);
  if (!candidates.some((value) => supplied.length === Buffer.byteLength(value) && timingSafeEqual(supplied, Buffer.from(value)))) {
    throw new Error("电子签约回调验签失败。");
  }
  return JSON.parse(rawBody) as Record<string, unknown>;
}
