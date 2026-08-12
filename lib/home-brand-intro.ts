export const HOME_BRAND_INTRO_MAX_DURATION_MS = 2_600;

export type HomeBrandIntroState = "play" | "settled";

export function evaluateHomeBrandIntro(
  prefersReducedMotion: () => boolean,
  getVisibilityState: () => string,
): HomeBrandIntroState {
  try {
    return getVisibilityState() === "visible" && !prefersReducedMotion() ? "play" : "settled";
  } catch {
    return "settled";
  }
}

export function claimHomeBrandIntro(
  prefersReducedMotion: () => boolean,
  getVisibilityState: () => string,
): HomeBrandIntroState {
  return evaluateHomeBrandIntro(prefersReducedMotion, getVisibilityState);
}

export function claimHomeBrandIntroInBrowser(): HomeBrandIntroState {
  return evaluateHomeBrandIntro(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => document.visibilityState,
  );
}

export function scheduleHomeBrandIntroSettlement(
  schedule: (callback: () => void) => void,
  generationRef: { current: number },
  effectGeneration: number,
  settle: () => void,
) {
  schedule(() => {
    if (generationRef.current === effectGeneration) settle();
  });
}
