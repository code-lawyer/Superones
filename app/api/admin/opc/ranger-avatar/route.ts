import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
} from "@/lib/admin-access";
import {
  assertRangerAvatarMultipartLength,
  MAX_RANGER_AVATAR_UPLOAD_BYTES,
  processAndStoreRangerAvatar,
  RangerAvatarImageError,
} from "@/lib/ranger-avatar-image";
import { rangerAvatarPublicUrl } from "@/lib/ranger-avatar";
import { publicRangerMediaOrigin } from "@/lib/ranger-avatar-storage";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, {
      mutation: true,
      mutationBodyType: "multipart",
    });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }

  const actorHash = access.session.actorHash;
  try {
    assertRangerAvatarMultipartLength(request.headers);
    const form = await request.formData();
    const file = form.get("file");
    const slug = form.get("slug");
    if (!(file instanceof File) || typeof slug !== "string") {
      throw new RangerAvatarImageError("请选择头像文件，并先填写有效的游骑兵 slug。");
    }
    if (file.size > MAX_RANGER_AVATAR_UPLOAD_BYTES) {
      throw new RangerAvatarImageError("头像文件必须小于 5MB。", 413);
    }
    const asset = await processAndStoreRangerAvatar(Buffer.from(await file.arrayBuffer()), slug);
    const mediaOrigin = publicRangerMediaOrigin();
    await recordAuditEvent({
      actorHash,
      action: "admin.opc.ranger-avatar.upload",
      targetType: "opc-ranger-avatar",
      targetId: slug,
      result: "success",
      diff: { sha256: asset.sha256, bytes: file.size },
    });
    return authenticatedAdminJson(access, {
      asset,
      previewUrl: rangerAvatarPublicUrl(asset, "small", mediaOrigin),
    });
  } catch (error) {
    const expected = error instanceof RangerAvatarImageError;
    const internalMessage = error instanceof Error ? error.message : "头像上传失败。";
    const message = expected ? internalMessage : "头像上传暂时失败，请稍后重试。";
    await recordAuditEvent({
      actorHash,
      action: "admin.opc.ranger-avatar.upload",
      targetType: "opc-ranger-avatar",
      targetId: "upload",
      result: expected ? "rejected" : "failed",
      reason: internalMessage.slice(0, 200),
    }).catch(() => undefined);
    return authenticatedAdminJson(access, { error: message }, { status: expected ? error.status : 500 });
  }
}
