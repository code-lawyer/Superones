import "server-only";

import { randomUUID } from "node:crypto";
import { decryptSensitiveText } from "../sensitive-data.ts";
import type { OpcContractArchiveRecord } from "../opc-contract-archive.ts";
import type { OpcEsignCreatedFlow, OpcEsignFlowStatus, OpcSignerParty } from "../opc-esign.ts";
import { LEGAL_OPERATOR_CREDIT_CODE, LEGAL_OPERATOR_NAME } from "../legal-profile.ts";
import {
  applySignatureStatus,
  mutateOpcOrderStore,
  publicOrder,
  readOpcOrderStore,
  validResumeToken,
} from "./internal-store.ts";

export async function claimOpcSignaturePreparation(reference: string, resumeToken: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (order.signature.flowId) return { claimed: false as const, flowExists: true as const, claimId: null };
    const now = new Date();
    if (
      order.signature.preparationClaimId
      && order.signature.preparationLeaseExpiresAt
      && new Date(order.signature.preparationLeaseExpiresAt).getTime() > now.getTime()
    ) {
      return { claimed: false as const, flowExists: false as const, claimId: null };
    }
    const claimId = randomUUID();
    order.signature.preparationClaimId = claimId;
    order.signature.preparationLeaseExpiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
    order.signature.status = "preparing";
    order.signature.failureReason = null;
    order.updatedAt = now.toISOString();
    return { claimed: true as const, flowExists: false as const, claimId };
  });
}

export async function getOpcSignaturePreparation(reference: string, resumeToken: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken) || !order.signerEncrypted) {
    throw new Error("订单签署凭据无效或已经过期。");
  }
  const signer = JSON.parse(decryptSensitiveText(order.signerEncrypted)) as OpcSignerParty;
  return {
    reference: order.reference,
    status: order.status,
    signature: order.signature,
    signer,
    fields: {
      order_reference: order.reference,
      service_code: order.serviceCode,
      service_name: order.serviceName,
      service_revision: order.serviceRevision,
      quoted_price: order.quotedPrice,
      service_period: order.servicePeriod,
      service_outcome: order.serviceOutcome,
      service_scope: order.serviceScope,
      service_boundary: order.serviceBoundary,
      provider_name: LEGAL_OPERATOR_NAME,
      provider_credit_code: LEGAL_OPERATOR_CREDIT_CODE,
      customer_name: signer.name,
      customer_phone: signer.phone,
      customer_org_name: signer.organizationName,
      customer_org_credit_code: signer.organizationCreditCode,
      customer_legal_representative: signer.legalRepresentativeName,
    },
  };
}

export async function bindOpcSignatureFlow(
  reference: string,
  resumeToken: string,
  claimId: string,
  flow: OpcEsignCreatedFlow,
) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (order.signature.preparationClaimId !== claimId) throw new Error("订单签署创建租约无效或已经过期。");
    if (order.signature.flowId && order.signature.flowId !== flow.flowId) {
      throw new Error("订单已经绑定其他签署流程。");
    }
    const timestamp = new Date().toISOString();
    order.signature = {
      ...order.signature,
      provider: flow.provider,
      status: "awaiting_signer",
      flowId: flow.flowId,
      fileId: flow.fileId,
      templateId: flow.templateId,
      templateVersion: flow.templateVersion,
      createdAt: order.signature.createdAt ?? timestamp,
      failureReason: null,
      preparationClaimId: null,
      preparationLeaseExpiresAt: null,
    };
    order.updatedAt = timestamp;
    return { ...publicOrder(order), resumeToken };
  });
}

export async function markOpcSignaturePreparationFailed(reference: string, resumeToken: string, claimId: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken) || order.signature.preparationClaimId !== claimId) return;
    order.signature.status = "failed";
    order.signature.failureReason = "provider_request_failed";
    order.signature.preparationClaimId = null;
    order.signature.preparationLeaseExpiresAt = null;
    order.updatedAt = new Date().toISOString();
  });
}

export async function recordOpcSignatureCallback(flowId: string, eventHash: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) return null;
    if (!/^[a-f0-9]{64}$/.test(eventHash)) throw new Error("签署回调事件摘要无效。");
    if (order.signature.callbackEventHashes.includes(eventHash)) return publicOrder(order);
    const timestamp = new Date().toISOString();
    order.signature.notifiedAt ??= timestamp;
    order.signature.callbackEventHashes = [...order.signature.callbackEventHashes.slice(-31), eventHash];
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function applyOpcSignatureStatus(
  reference: string,
  resumeToken: string,
  status: OpcEsignFlowStatus,
) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.reference === reference);
    if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
    if (!order.signature.flowId) throw new Error("订单尚未建立签署流程。");
    const timestamp = new Date().toISOString();
    applySignatureStatus(order, status, timestamp);
    return { ...publicOrder(order), resumeToken };
  });
}

export async function applyOpcSignatureStatusByFlow(flowId: string, status: OpcEsignFlowStatus) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    const timestamp = new Date().toISOString();
    applySignatureStatus(order, status, timestamp);
    return publicOrder(order);
  });
}

export async function getOpcOrderByResumeToken(reference: string, resumeToken: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.reference === reference);
  if (!order || !validResumeToken(order, resumeToken)) throw new Error("订单签署凭据无效或已经过期。");
  return {
    ...publicOrder(order),
    flowId: order.signature.flowId,
    provider: order.signature.provider,
    resumeToken,
  };
}

export async function completeMockOpcSignature(reference: string, resumeToken: string) {
  if (process.env.NODE_ENV === "production") throw new Error("生产环境不能使用模拟签署。");
  return applyOpcSignatureStatus(reference, resumeToken, "completed");
}

export async function getOpcSignatureArchivePreparationByFlow(flowId: string) {
  const store = await readOpcOrderStore();
  const order = store.orders.find((value) => value.signature.flowId === flowId);
  if (!order || !order.signature.fileId) throw new Error("签署流程未匹配到可归档的 OPC 订单。");
  return {
    reference: order.reference,
    flowId,
    fileId: order.signature.fileId,
    provider: order.signature.provider,
    signatureStatus: order.signature.status,
    archive: order.signature.archive,
  };
}

export async function claimOpcSignatureArchive(flowId: string) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    if (order.signature.archive.status === "archived") return { claimed: false as const, archived: true as const, claimId: null };
    const now = new Date();
    if (
      order.signature.archiveClaimId
      && order.signature.archiveLeaseExpiresAt
      && new Date(order.signature.archiveLeaseExpiresAt).getTime() > now.getTime()
    ) {
      return { claimed: false as const, archived: false as const, claimId: null };
    }
    const claimId = randomUUID();
    order.signature.archiveClaimId = claimId;
    order.signature.archiveLeaseExpiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
    order.signature.archive.status = "pending";
    order.signature.archive.failureReason = null;
    order.updatedAt = now.toISOString();
    return { claimed: true as const, archived: false as const, claimId };
  });
}

export async function completeOpcSignatureArchive(
  flowId: string,
  claimId: string,
  archive: Omit<OpcContractArchiveRecord, "status" | "failureReason">,
) {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order) throw new Error("签署流程未匹配到 OPC 订单。");
    if (order.signature.status !== "completed") throw new Error("签署流程尚未完成，不能归档放行付款。");
    if (order.signature.archiveClaimId !== claimId) throw new Error("合同归档租约无效或已经过期。");
    const timestamp = new Date().toISOString();
    order.signature.archive = { ...archive, status: "archived", failureReason: null };
    order.signature.archiveClaimId = null;
    order.signature.archiveLeaseExpiresAt = null;
    if (order.status === "awaiting_signature") order.status = "awaiting_payment";
    order.updatedAt = timestamp;
    return publicOrder(order);
  });
}

export async function markOpcSignatureArchiveFailed(flowId: string, claimId: string, reason = "archive_failed") {
  return mutateOpcOrderStore((store) => {
    const order = store.orders.find((value) => value.signature.flowId === flowId);
    if (!order || order.signature.archiveClaimId !== claimId) return null;
    order.signature.archive.status = "failed";
    order.signature.archive.failureReason = reason;
    order.signature.archiveClaimId = null;
    order.signature.archiveLeaseExpiresAt = null;
    order.updatedAt = new Date().toISOString();
    return publicOrder(order);
  });
}
