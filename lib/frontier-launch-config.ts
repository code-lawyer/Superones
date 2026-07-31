export function isValidFrontierReward(value: string) {
  const normalized = value.trim();
  if (normalized.length < 4 || normalized.length > 200) return false;
  return !/待公布|待定|占位|tbd|to be announced|change-me|replace-with|example/i.test(normalized);
}

export function frontierMasterWritesEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.NODE_ENV !== "production") {
    return environment.VAULT2077_FRONTIER_WRITES_ENABLED !== "false";
  }
  return environment.VAULT2077_FRONTIER_WRITES_ENABLED === "true";
}
