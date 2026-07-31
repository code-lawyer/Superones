import { adminActorHash } from "../lib/admin-auth.ts";
import { passkeyAdminIdentity } from "../lib/admin-identity.ts";
import { issueAdminPasskeyEnrollmentToken } from "../lib/admin-passkey-store.ts";
import { revokeAllAdminSessions } from "../lib/admin-session-store.ts";
import { recordAuditEvent } from "../lib/security-audit.ts";
import { withPersistenceTransaction } from "../lib/state-document-store.ts";

const allowed = new Set(["--revoke-existing"]);
const unknown = process.argv.slice(2).filter((value) => !allowed.has(value));
if (unknown.length) throw new Error(`未知参数：${unknown.join(", ")}`);

const revokeExisting = process.argv.includes("--revoke-existing");
const actorHash = adminActorHash(passkeyAdminIdentity().subject);
const result = await withPersistenceTransaction(async () => {
  const issued = await issueAdminPasskeyEnrollmentToken({ revokeExisting });
  const revokedSessions = revokeExisting ? await revokeAllAdminSessions() : 0;
  await recordAuditEvent({
    actorHash,
    action: "admin.passkey.recovery-token.issue",
    targetType: "credential",
    targetId: "owner",
    result: "success",
    diff: { revokeExisting },
  });
  if (revokeExisting) {
    await recordAuditEvent({
      actorHash,
      action: "admin.passkey.reset",
      targetType: "credential",
      targetId: "owner",
      result: "success",
      diff: { revokedSessions },
    });
  }
  return issued;
});

process.stdout.write([
  "Vault2077 管理员 Passkey 一次性注册令牌：",
  result.token,
  `过期时间：${result.expiresAt}`,
  revokeExisting
    ? "现有 Passkey 与后台会话已全部撤销。"
    : "现有 Passkey 未更改。",
  "请通过 SSH 私密传递并在管理域名立即使用；令牌不会再次显示。",
  "",
].join("\n"));
