import { NextRequest, NextResponse } from "next/server";
import {
  adminActorHash,
  adminCookieName,
  adminCookieOptions,
} from "@/lib/admin-auth";
import {
  adminOidcTransactionCookieName,
  adminOidcTransactionCookieOptions,
  decodeAdminOidcTransaction,
  exchangeAdminOidcCode,
} from "@/lib/admin-oidc";
import { assertAdminHost, configuredAdminOrigin } from "@/lib/admin-request-security";
import {
  createAdminSession,
  markAdminSessionReauthenticated,
  readAdminSession,
} from "@/lib/admin-session-store";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

function callbackRedirect(request: NextRequest, outcome: string) {
  const url = new URL("/admin", configuredAdminOrigin() || request.nextUrl.origin);
  url.searchParams.set("oidc", outcome);
  return url;
}

function clearTransaction(response: NextResponse) {
  response.cookies.set(adminOidcTransactionCookieName(), "", {
    ...adminOidcTransactionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  try {
    assertAdminHost(request);
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) throw new Error(`provider:${providerError.slice(0, 60)}`);
    const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
    const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";
    const encodedTransaction = request.cookies.get(adminOidcTransactionCookieName())?.value ?? "";
    if (!code || !state || !encodedTransaction) throw new Error("missing-callback-state");
    const transaction = decodeAdminOidcTransaction(encodedTransaction);
    if (state !== transaction.state) throw new Error("state-mismatch");
    const identity = await exchangeAdminOidcCode(code, transaction);
    if (transaction.intent === "reauth") {
      const token = request.cookies.get(adminCookieName())?.value;
      const current = await readAdminSession(token);
      if (
        !token
        || !current
        || !transaction.actorHash
        || current.actorHash !== transaction.actorHash
        || adminActorHash(identity.subject) !== current.actorHash
      ) {
        throw new Error("reauth-actor-mismatch");
      }
      const session = await markAdminSessionReauthenticated(token, identity.authenticatedAt);
      if (!session) throw new Error("reauth-session-expired");
      await recordAuditEvent({
        actorHash: session.actorHash,
        action: "admin.reauthenticate",
        targetType: "session",
        targetId: session.id,
        result: "success",
        diff: { mode: "oidc" },
      });
      const response = clearTransaction(
        NextResponse.redirect(callbackRedirect(request, "reauthenticated"), 303),
      );
      response.cookies.set(adminCookieName(), token, adminCookieOptions());
      return response;
    }
    const created = await createAdminSession(identity);
    await recordAuditEvent({
      actorHash: created.session.actorHash,
      action: "admin.login",
      targetType: "session",
      targetId: created.session.id,
      result: "success",
      diff: { role: created.session.role, mode: "oidc" },
    });
    const response = clearTransaction(
      NextResponse.redirect(callbackRedirect(request, "authenticated"), 303),
    );
    response.cookies.set(adminCookieName(), created.token, adminCookieOptions());
    return response;
  } catch (error) {
    await recordAuditEvent({
      actorHash: clientHash,
      action: "admin.oidc.callback",
      targetType: "session",
      targetId: "oidc",
      result: "rejected",
      reason: error instanceof Error ? error.message.slice(0, 120) : "oidc-callback-failed",
    }).catch(() => undefined);
    return clearTransaction(
      NextResponse.redirect(callbackRedirect(request, "failed"), 303),
    );
  }
}
