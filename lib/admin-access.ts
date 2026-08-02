import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { adminCookieName, adminCookieOptions } from "./admin-auth.ts";
import {
  assertAdminHost,
  assertAdminMutationRequest,
  AdminRequestSecurityError,
  type AdminMutationBodyType,
} from "./admin-request-security.ts";
import { readAdminSession, type AdminSession } from "./admin-session-store.ts";

export type AdminAccess = {
  token: string;
  session: AdminSession;
};

export type AdminAccessOptions = {
  mutation?: boolean;
  mutationBodyType?: AdminMutationBodyType;
};

export class AdminAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AdminAccessError";
    this.status = status;
    this.code = code;
  }
}

export async function authenticateAdminRequest(
  request: NextRequest,
  options: AdminAccessOptions = {},
): Promise<AdminAccess> {
  try {
    if (options.mutation) assertAdminMutationRequest(request, options.mutationBodyType);
    else assertAdminHost(request);
  } catch (error) {
    if (error instanceof AdminRequestSecurityError) {
      throw new AdminAccessError(error.message, error.status, error.code);
    }
    throw error;
  }
  const token = request.cookies.get(adminCookieName())?.value;
  const session = await readAdminSession(token);
  if (!token || !session) {
    throw new AdminAccessError("需要重新进入安全后台。", 401, "ADMIN_SESSION_REQUIRED");
  }
  if (session.role !== "owner") {
    throw new AdminAccessError("当前身份没有执行该后台操作的权限。", 403, "ADMIN_PERMISSION_DENIED");
  }
  return { token, session };
}

export function authenticatedAdminJson(access: AdminAccess, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.cookies.set(adminCookieName(), access.token, adminCookieOptions());
  return response;
}

export function authenticatedAdminResponse(access: AdminAccess, response: NextResponse) {
  response.cookies.set(adminCookieName(), access.token, adminCookieOptions());
  return response;
}

export function adminAccessErrorResponse(error: unknown) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  throw error;
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(adminCookieName(), "", { ...adminCookieOptions(), maxAge: 0 });
  return response;
}

export function configuredAdminReauthenticationUrl() {
  return process.env.NODE_ENV === "production"
    ? "/admin#admin-reauth"
    : "/admin";
}
