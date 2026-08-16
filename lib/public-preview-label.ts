import "server-only";

type PreviewEnvironment = Readonly<Record<string, string | undefined>>;

export function publicPreviewLabel(environment: PreviewEnvironment = process.env) {
  const hasProductionStore = Boolean(
    environment.VAULT2077_DATABASE_URL?.trim() || environment.DATABASE_URL?.trim(),
  );
  if (hasProductionStore) return "";

  const filePreviewAllowed = environment.NODE_ENV !== "production"
    || environment.VAULT2077_ALLOW_FILE_PREVIEW === "true";
  if (!filePreviewAllowed) return "";

  return environment.VAULT2077_CONTENT_PREVIEW_LABEL?.trim() || "本地预览";
}
