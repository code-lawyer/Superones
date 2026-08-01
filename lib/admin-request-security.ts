import "server-only";

import type { NextRequest } from "next/server";

export class AdminRequestSecurityError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 403, code = "ADMIN_REQUEST_REJECTED") {
    super(message);
    this.name = "AdminRequestSecurityError";
    this.status = status;
    this.code = code;
  }
}

export function configuredAdminOrigin() {
  const configured = process.env.VAULT2077_ADMIN_ORIGIN?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.origin !== configured.replace(/\/$/, "")) {
      throw new Error("后台来源必须是不带路径、查询参数或片段的 origin。");
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("生产后台来源必须使用 HTTPS。");
    }
    return url.origin;
  }
  if (process.env.NODE_ENV === "production") throw new Error("生产后台来源未配置。");
  return "";
}

function requestTargetOrigin(request: NextRequest) {
  const configured = configuredAdminOrigin();
  if (configured) return configured;
  const host = request.headers.get("host")?.trim().toLowerCase();
  return host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
}

export function assertAdminHost(request: NextRequest) {
  const configured = configuredAdminOrigin();
  const requestHost = request.headers.get("host")?.trim().toLowerCase() ?? "";
  if (!configured) {
    const hostname = requestHost.split(":")[0] || request.nextUrl.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return;
    throw new AdminRequestSecurityError("本地后台只接受回环来源。", 404, "ADMIN_HOST_REJECTED");
  }
  if (requestHost !== new URL(configured).host.toLowerCase()) {
    throw new AdminRequestSecurityError("该来源不提供管理入口。", 404, "ADMIN_HOST_REJECTED");
  }
}

export function assertAdminPageHost(headers: Headers) {
  const configured = configuredAdminOrigin();
  const host = headers.get("host")?.trim().toLowerCase() ?? "";
  if (!configured) {
    const hostname = host.split(":")[0];
    if (hostname === "localhost" || hostname === "127.0.0.1") return;
    throw new AdminRequestSecurityError("本地后台只接受回环来源。", 404, "ADMIN_HOST_REJECTED");
  }
  if (host !== new URL(configured).host.toLowerCase()) {
    throw new AdminRequestSecurityError("该来源不提供管理入口。", 404, "ADMIN_HOST_REJECTED");
  }
}

export type AdminMutationBodyType = "json" | "multipart";

export function assertAdminMutationRequest(
  request: NextRequest,
  bodyType: AdminMutationBodyType = "json",
) {
  assertAdminHost(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const acceptedContentType = bodyType === "multipart"
    ? contentType.startsWith("multipart/form-data;") && contentType.includes("boundary=")
    : contentType.startsWith("application/json");
  if (!acceptedContentType) {
    if (bodyType === "multipart") {
      throw new AdminRequestSecurityError(
        "头像上传必须使用带 boundary 的 multipart/form-data。",
        415,
        "ADMIN_MULTIPART_REQUIRED",
      );
    }
    throw new AdminRequestSecurityError("后台写请求必须使用 JSON。", 415, "ADMIN_JSON_REQUIRED");
  }
  if (request.headers.get("x-vault2077-admin-request") !== "1") {
    throw new AdminRequestSecurityError("后台写请求缺少同源标记。", 403, "ADMIN_REQUEST_HEADER_REQUIRED");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new AdminRequestSecurityError("后台拒绝跨来源写请求。", 403, "ADMIN_CROSS_SITE_REJECTED");
  }
  const expectedOrigin = requestTargetOrigin(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let sourceOrigin = "";
  try {
    sourceOrigin = origin
      ? new URL(origin).origin
      : referer
        ? new URL(referer).origin
        : "";
  } catch {
    throw new AdminRequestSecurityError("后台写请求来源校验失败。", 403, "ADMIN_ORIGIN_REJECTED");
  }
  if (!sourceOrigin || sourceOrigin !== expectedOrigin) {
    throw new AdminRequestSecurityError("后台写请求来源校验失败。", 403, "ADMIN_ORIGIN_REJECTED");
  }
}
