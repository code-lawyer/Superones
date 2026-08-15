import type { RangerIdentity, RangerProfile } from "./opc-catalog.ts";

export type RangerShelfEntry = {
  key: string;
  identity: RangerIdentity;
  profile: RangerProfile | null;
};

export function buildRangerShelfEntries(
  profiles: RangerProfile[],
  identities: RangerIdentity[],
): RangerShelfEntry[] {
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const occupiedIdentities = new Set(profiles.map((profile) => profile.identityId));
  const publishedProfiles = profiles.flatMap((profile) => {
    const identity = identityById.get(profile.identityId);
    return identity ? [{ key: `profile-${profile.slug}`, identity, profile }] : [];
  });
  const vacantIdentities = identities
    .filter((identity) => !occupiedIdentities.has(identity.id))
    .map((identity) => ({ key: `template-${identity.id}`, identity, profile: null }));

  return [...publishedProfiles, ...vacantIdentities];
}
