export const RANGER_AVATAR_SCHEMA_VERSION = 1 as const;

export type RangerAvatarAsset = {
  schemaVersion: typeof RANGER_AVATAR_SCHEMA_VERSION;
  smallKey: string;
  largeKey: string;
  sha256: string;
  width: number;
  height: number;
  updatedAt: string;
};

const avatarKeyPattern = /^rangers\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9a-f]{64}\/avatar-(320|800)\.webp$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const legacyAvatarDataPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

export function isRangerAvatarObjectKey(value: unknown): value is string {
  return typeof value === "string" && avatarKeyPattern.test(value);
}

export function legacyRangerAvatarPublicUrl(value: unknown) {
  return typeof value === "string" && legacyAvatarDataPattern.test(value) ? value : undefined;
}

export function isRangerAvatarAsset(value: unknown): value is RangerAvatarAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<RangerAvatarAsset>;
  if (
    asset.schemaVersion !== RANGER_AVATAR_SCHEMA_VERSION
    || !isRangerAvatarObjectKey(asset.smallKey)
    || !isRangerAvatarObjectKey(asset.largeKey)
    || typeof asset.sha256 !== "string"
    || !sha256Pattern.test(asset.sha256)
    || asset.width !== 800
    || asset.height !== 800
    || typeof asset.updatedAt !== "string"
    || !Number.isFinite(Date.parse(asset.updatedAt))
  ) return false;

  const prefix = `/${asset.sha256}/`;
  return asset.smallKey.includes(prefix)
    && asset.largeKey.includes(prefix)
    && asset.smallKey.endsWith("/avatar-320.webp")
    && asset.largeKey.endsWith("/avatar-800.webp")
    && asset.smallKey.slice(0, asset.smallKey.indexOf(prefix))
      === asset.largeKey.slice(0, asset.largeKey.indexOf(prefix));
}

export function rangerAvatarPublicUrl(
  asset: RangerAvatarAsset,
  size: "small" | "large",
  publicOrigin = "",
) {
  const key = size === "small" ? asset.smallKey : asset.largeKey;
  const origin = publicOrigin.replace(/\/$/, "");
  return origin ? `${origin}/${key}` : `/media/${key}`;
}
