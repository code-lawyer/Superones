import "server-only";

import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
import type { AdminRole } from "./admin-auth.ts";

export type AdminIdentity = {
  subject: string;
  email: string;
  role: AdminRole;
  authenticatedAt: string;
};

export function adminAccessMode(): "passkey" | "local-password" {
  return process.env.NODE_ENV === "production" ? "passkey" : "local-password";
}

export function passkeyAdminIdentity(now = new Date()): AdminIdentity {
  return {
    subject: "passkey-owner",
    email: PRODUCTION_ADMIN_EMAIL,
    role: "owner",
    authenticatedAt: now.toISOString(),
  };
}

export function localAdminIdentity(now = new Date()): AdminIdentity {
  if (adminAccessMode() !== "local-password") throw new Error("生产环境不接受本地管理员身份。");
  return {
    subject: "local-owner",
    email: "local-owner@vault2077.invalid",
    role: "owner",
    authenticatedAt: now.toISOString(),
  };
}
