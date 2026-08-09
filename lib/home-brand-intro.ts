export const HOME_BRAND_INTRO_STORAGE_KEY = "vault2077:home-brand-intro:v1";
export const HOME_BRAND_INTRO_SEEN_VALUE = "seen";
export const HOME_BRAND_INTRO_MAX_DURATION_MS = 1_200;

export type HomeBrandIntroState = "play" | "settled";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export function evaluateHomeBrandIntro(
  storageKey: string,
  seenValue: string,
  getStorage: () => SessionStorageLike,
  prefersReducedMotion: () => boolean,
  getVisibilityState: () => string,
): HomeBrandIntroState {
  try {
    const storage = getStorage();
    if (storage.getItem(storageKey) === seenValue) {
      return "settled";
    }

    // A reduced-motion visit still counts as this session's first homepage visit.
    // Record the claim before deciding whether the visual sequence may play.
    storage.setItem(storageKey, seenValue);
    return getVisibilityState() === "visible" && !prefersReducedMotion() ? "play" : "settled";
  } catch {
    return "settled";
  }
}

export function claimHomeBrandIntro(
  storage: SessionStorageLike,
  prefersReducedMotion: () => boolean,
  getVisibilityState: () => string,
): HomeBrandIntroState {
  return evaluateHomeBrandIntro(
    HOME_BRAND_INTRO_STORAGE_KEY,
    HOME_BRAND_INTRO_SEEN_VALUE,
    () => storage,
    prefersReducedMotion,
    getVisibilityState,
  );
}

export function claimHomeBrandIntroInBrowser(): HomeBrandIntroState {
  return evaluateHomeBrandIntro(
    HOME_BRAND_INTRO_STORAGE_KEY,
    HOME_BRAND_INTRO_SEEN_VALUE,
    () => window.sessionStorage,
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

export const HOME_BRAND_INTRO_INLINE_SCRIPT = `(() => {
  const root = document.documentElement;
  const evaluate = ${evaluateHomeBrandIntro.toString()};
  root.dataset.homeBrandIntro = evaluate(
    ${JSON.stringify(HOME_BRAND_INTRO_STORAGE_KEY)},
    ${JSON.stringify(HOME_BRAND_INTRO_SEEN_VALUE)},
    () => window.sessionStorage,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => document.visibilityState
  );
})();`;
