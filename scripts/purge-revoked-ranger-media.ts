import { purgeRangerAvatarMediaAfterRevocation } from "../lib/managed-service-catalog.ts";
import { recordAuditEvent } from "../lib/security-audit.ts";

const slug = process.argv[2]?.trim();
if (!slug) throw new Error("用法：npm run opc:purge-revoked-ranger-media -- <ranger-slug>");

try {
  const deletedKeys = await purgeRangerAvatarMediaAfterRevocation(slug);
  await recordAuditEvent({
    actorHash: "system:operator-cli",
    action: "admin.opc.ranger-avatar.revoke",
    targetType: "opc-ranger-avatar",
    targetId: slug,
    result: "success",
    diff: { deletedKeys },
  });
  console.log(JSON.stringify({ slug, deleted: deletedKeys.length, deletedKeys }, null, 2));
} catch (error) {
  await recordAuditEvent({
    actorHash: "system:operator-cli",
    action: "admin.opc.ranger-avatar.revoke",
    targetType: "opc-ranger-avatar",
    targetId: slug,
    result: "failed",
    reason: error instanceof Error ? error.message.slice(0, 200) : "unknown-error",
  }).catch(() => undefined);
  throw error;
}
