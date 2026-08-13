import { rangerIdentities, type RangerProfile } from "./opc-catalog.ts";

export type RangerShelfEntry = {
  key: string;
  identity: (typeof rangerIdentities)[number];
  profile: RangerProfile | null;
};

export function buildRangerShelfEntries(profiles: RangerProfile[]): RangerShelfEntry[] {
  const occupiedIdentities = new Set(profiles.map((profile) => profile.identity));
  const publishedProfiles = profiles.map((profile) => ({
    key: `profile-${profile.slug}`,
    identity: profile.identity as RangerShelfEntry["identity"],
    profile,
  }));
  const vacantIdentities = rangerIdentities
    .filter((identity) => !occupiedIdentities.has(identity))
    .map((identity) => ({ key: `template-${identity}`, identity, profile: null }));

  return [...publishedProfiles, ...vacantIdentities];
}
