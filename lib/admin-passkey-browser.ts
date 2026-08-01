"use client";

import { startAuthentication } from "@simplewebauthn/browser";

const adminMutationHeaders = {
  "Content-Type": "application/json",
  "X-Vault2077-Admin-Request": "1",
};

type PasskeyOptionsResponse = {
  ceremonyId?: string;
  options?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  error?: string;
};

export async function reauthenticateAdminWithPasskey() {
  const optionsResponse = await fetch("/api/admin/passkey/authenticate/options", {
    method: "POST",
    headers: adminMutationHeaders,
    body: JSON.stringify({ purpose: "reauthentication" }),
  });
  const optionsBody = await optionsResponse.json().catch(() => null) as PasskeyOptionsResponse | null;
  if (!optionsResponse.ok || !optionsBody?.ceremonyId || !optionsBody.options) {
    throw new Error(optionsBody?.error ?? "无法开始 Passkey 验证。");
  }

  const credential = await startAuthentication({ optionsJSON: optionsBody.options });
  const verifyResponse = await fetch("/api/admin/passkey/authenticate/verify", {
    method: "POST",
    headers: adminMutationHeaders,
    body: JSON.stringify({
      ceremonyId: optionsBody.ceremonyId,
      purpose: "reauthentication",
      response: credential,
    }),
  });
  const verifyBody = await verifyResponse.json().catch(() => null) as { error?: string } | null;
  if (!verifyResponse.ok) {
    throw new Error(verifyBody?.error ?? "Passkey 身份校验失败。");
  }
}
