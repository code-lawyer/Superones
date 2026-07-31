import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import { PUBLISHED_SERVICE_CATALOG_CACHE_TAG } from "@/lib/cache-tags";
import {
  publishServiceCatalog,
  readManagedServiceCatalog,
  saveServiceCatalogDraft,
  ServiceCatalogConflictError,
  ServiceCatalogValidationError,
} from "@/lib/managed-service-catalog";
import { recordAuditEvent } from "@/lib/security-audit";
import { publicRangerMediaOrigin } from "@/lib/ranger-avatar-storage";

export const runtime = "nodejs";

function catalogCounts(value: unknown) {
  const catalog = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    infrastructure: Array.isArray(catalog.infrastructure) ? catalog.infrastructure.length : 0,
    specialties: Array.isArray(catalog.specialties) ? catalog.specialties.length : 0,
    rangers: Array.isArray(catalog.rangers) ? catalog.rangers.length : 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authenticateAdminRequest(request);
    return authenticatedAdminJson(access, {
      catalog: {
        ...await readManagedServiceCatalog(),
        rangerMediaOrigin: publicRangerMediaOrigin(),
      },
    });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const actorHash = access.session.actorHash;
  let action = "unknown";
  try {
    const body = await request.json() as {
      action?: unknown;
      expectedRevision?: unknown;
      catalog?: unknown;
      confirm?: unknown;
    };
    action = typeof body.action === "string" ? body.action : "unknown";
    if (action === "publish" && !hasRecentAdminReauthentication(access.session)) {
      await recordAuditEvent({
        actorHash,
        action: "admin.opc.publish",
        targetType: "opc-service-catalog",
        targetId: "current",
        result: "rejected",
        reason: "recent-reauthentication-required",
      });
      return authenticatedAdminJson(access, {
        error: "发布 OPC 目录前需要重新验证管理员身份。",
        code: "ADMIN_REAUTH_REQUIRED",
        reauthenticationUrl: configuredAdminReauthenticationUrl(),
      }, { status: 403 });
    }
    if (
      !["save-draft", "publish"].includes(action)
      || !Number.isSafeInteger(body.expectedRevision)
      || Number(body.expectedRevision) < 1
      || body.confirm !== true
    ) {
      await recordAuditEvent({
        actorHash,
        action: `admin.opc.${action}`,
        targetType: "opc-service-catalog",
        targetId: "current",
        result: "rejected",
        reason: "invalid-or-unconfirmed-request",
      });
      return authenticatedAdminJson(access, { error: "OPC 菜单写操作需要有效版本和明确二次确认。" }, { status: 400 });
    }

    const result = action === "publish"
      ? await publishServiceCatalog(body.catalog, Number(body.expectedRevision))
      : await saveServiceCatalogDraft(body.catalog, Number(body.expectedRevision));
    if (action === "publish") {
      revalidateTag(PUBLISHED_SERVICE_CATALOG_CACHE_TAG, { expire: 0 });
    }
    await recordAuditEvent({
      actorHash,
      action: `admin.opc.${action}`,
      targetType: "opc-service-catalog",
      targetId: "current",
      result: "success",
      diff: {
        revision: result.revision,
        ...catalogCounts(body.catalog),
      },
    });
    return authenticatedAdminJson(access, {
      catalog: {
        ...await readManagedServiceCatalog(),
        rangerMediaOrigin: publicRangerMediaOrigin(),
      },
    });
  } catch (error) {
    const status = error instanceof ServiceCatalogConflictError
      ? 409
      : error instanceof ServiceCatalogValidationError
        ? 422
        : 500;
    const message = error instanceof Error ? error.message : "暂时无法更新 OPC 服务目录。";
    await recordAuditEvent({
      actorHash,
      action: `admin.opc.${action}`,
      targetType: "opc-service-catalog",
      targetId: "current",
      result: status === 409 || status === 422 ? "rejected" : "failed",
      reason: message.slice(0, 200),
    }).catch(() => undefined);
    return authenticatedAdminJson(
      access,
      {
        error: message,
        details: error instanceof ServiceCatalogValidationError ? error.errors : undefined,
      },
      { status },
    );
  }
}
