const ROUTINE_RELEASE_PATTERN = /\b(?:nightly|snapshot|canary|continuous|draft|pre-?release|alpha(?:[._-]?\d+)?|beta(?:[._-]?\d+)?|rc(?:[._-]?\d+)?)\b/i;

type ReleaseCandidate = {
  itemKind?: string;
  releasePrerelease?: boolean;
  releaseDraft?: boolean;
  originalTitle: string;
  sourceUrl?: string;
  originalUrl?: string;
};

export function isRoutineReleaseCandidate(candidate: Pick<ReleaseCandidate, "originalTitle" | "sourceUrl" | "originalUrl">) {
  return ROUTINE_RELEASE_PATTERN.test([
    candidate.originalTitle,
    candidate.sourceUrl,
    candidate.originalUrl,
  ].filter(Boolean).join(" "));
}

export function isPublicInformationAdmitted(candidate: ReleaseCandidate) {
  return candidate.itemKind !== "release" || (
    candidate.releasePrerelease !== true
    && candidate.releaseDraft !== true
    && !isRoutineReleaseCandidate(candidate)
  );
}
