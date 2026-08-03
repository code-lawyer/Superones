import "server-only";

import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { passkeyAdminIdentity } from "./admin-identity.ts";
import {
  completeAdminPasskeyAuthentication,
  completeAdminPasskeyRegistration,
  createAdminPasskeyCeremony,
  getAdminPasskey,
  getAdminPasskeyCeremony,
  listActiveAdminPasskeys,
  storedAdminPasskeyCredential,
} from "./admin-passkey-store.ts";
import { PRODUCTION_ADMIN_EMAIL } from "./admin-profile.ts";
import { configuredAdminOrigin } from "./admin-request-security.ts";
import { withPersistenceTransaction } from "./state-document-store.ts";

// Require the platform or security key to complete PIN/biometric verification
// and return the authenticator's signed UV flag for every ceremony.
const PASSKEY_BROWSER_USER_VERIFICATION = "required" as const;

function passkeyVerificationError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function passkeyConfiguration() {
  const origin = configuredAdminOrigin() || "http://localhost:3000";
  const url = new URL(origin);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("生产 Passkey 来源必须使用 HTTPS。");
  }
  return { origin: url.origin, rpID: url.hostname };
}

export async function beginAdminPasskeyRegistration(input: {
  enrollmentToken?: string;
  actorHash?: string;
}) {
  const { origin, rpID } = passkeyConfiguration();
  const credentials = await listActiveAdminPasskeys();
  const options = await generateRegistrationOptions({
    rpName: "Vault2077",
    rpID,
    userName: PRODUCTION_ADMIN_EMAIL,
    userDisplayName: "Vault2077 Owner",
    userID: createHash("sha256").update(`vault2077:${PRODUCTION_ADMIN_EMAIL}`).digest(),
    timeout: 5 * 60 * 1000,
    attestationType: "none",
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: PASSKEY_BROWSER_USER_VERIFICATION,
    },
  });
  const ceremony = await createAdminPasskeyCeremony({
    purpose: "registration",
    challenge: options.challenge,
    enrollmentToken: input.enrollmentToken,
    actorHash: input.actorHash,
  });
  return { ceremonyId: ceremony.id, options, origin };
}

export async function finishAdminPasskeyRegistration(input: {
  ceremonyId: string;
  response: RegistrationResponseJSON;
  authorizeCompletion?: () => Promise<void>;
}) {
  const ceremony = await getAdminPasskeyCeremony(input.ceremonyId, "registration");
  if (!ceremony) throw new Error("Passkey 注册会话无效或已过期。");
  const { origin, rpID } = passkeyConfiguration();
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserPresence: true,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo.userVerified) {
    throw new Error("Passkey 注册必须完成设备 PIN 或生物识别验证。");
  }
  return withPersistenceTransaction(async () => {
    return completeAdminPasskeyRegistration({
      ceremonyId: ceremony.id,
      credential: verification.registrationInfo.credential,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      authorizeCompletion: input.authorizeCompletion,
    });
  });
}

export async function beginAdminPasskeyAuthentication(input: {
  purpose: "login" | "reauthentication";
  actorHash?: string;
}) {
  const credentials = await listActiveAdminPasskeys();
  if (credentials.length === 0) throw new Error("尚未注册管理员 Passkey。");
  const { rpID } = passkeyConfiguration();
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 5 * 60 * 1000,
    userVerification: PASSKEY_BROWSER_USER_VERIFICATION,
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
  });
  const ceremony = await createAdminPasskeyCeremony({
    purpose: input.purpose,
    challenge: options.challenge,
    actorHash: input.actorHash,
  });
  return { ceremonyId: ceremony.id, options };
}

export async function finishAdminPasskeyAuthentication(input: {
  ceremonyId: string;
  purpose: "login" | "reauthentication";
  response: AuthenticationResponseJSON;
  actorHash?: string;
}) {
  const ceremony = await getAdminPasskeyCeremony(input.ceremonyId, input.purpose);
  if (!ceremony || (input.actorHash && ceremony.actorHash !== input.actorHash)) {
    throw passkeyVerificationError("webauthn-ceremony-invalid", "Passkey 验证会话无效或已过期。");
  }
  const passkey = await getAdminPasskey(input.response.id);
  if (!passkey) {
    throw passkeyVerificationError("webauthn-credential-not-found", "Passkey 不存在或已撤销。");
  }
  const credential = storedAdminPasskeyCredential(passkey);
  const { origin, rpID } = passkeyConfiguration();
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw passkeyVerificationError("webauthn-signature-invalid", "Passkey 签名校验失败。");
  }
  if (!verification.authenticationInfo.userVerified) {
    throw passkeyVerificationError("webauthn-user-verification-missing", "Passkey 登录必须完成设备 PIN 或生物识别验证。");
  }
  await completeAdminPasskeyAuthentication({
    ceremonyId: ceremony.id,
    purpose: input.purpose,
    credentialId: passkey.credentialId,
    previousCounter: passkey.counter,
    newCounter: verification.authenticationInfo.newCounter,
    actorHash: input.actorHash,
  });
  return passkeyAdminIdentity();
}
