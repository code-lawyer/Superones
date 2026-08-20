import "server-only";

import type { NextRequest } from "next/server.js";
import { adminAccessMode } from "./admin-identity.ts";
import { adminPasskeyStatus } from "./admin-passkey-store.ts";
import {
  AdminAccessError,
  authenticateAdminRequest,
  type AdminAccess,
} from "./admin-access.ts";

export type AdminLoginDiscovery = {
  access: AdminAccess | null;
  body: {
    mode: "passkey" | "local-password";
    authenticated: boolean;
    enrollmentRequired: boolean;
    recoveryCodesRemaining: number;
  };
};

export async function discoverAdminLoginState(request: NextRequest): Promise<AdminLoginDiscovery> {
  let access: AdminAccess | null = null;
  try {
    access = await authenticateAdminRequest(request);
  } catch (error) {
    if (!(error instanceof AdminAccessError) || error.code !== "ADMIN_SESSION_REQUIRED") throw error;
  }
  const mode = adminAccessMode();
  const passkey = mode === "passkey" ? await adminPasskeyStatus() : null;
  return {
    access,
    body: {
      mode,
      authenticated: access !== null,
      enrollmentRequired: passkey ? passkey.activeCredentials === 0 : false,
      recoveryCodesRemaining: passkey?.unusedRecoveryCodes ?? 0,
    },
  };
}
