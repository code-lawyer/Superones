import "server-only";

import { randomUUID } from "node:crypto";
import { PRIZE_NOTICE_REVISION, seasonForDate } from "../frontier-domain.ts";
import { encryptSensitiveText } from "../sensitive-data.ts";
import { mutateFrontierStore, readFrontierStore } from "./internal-store.ts";
import type { PublicPrizeDonation, PublicPrizeDonationStatus, StoredPrizeDonation } from "./model.ts";

export async function createPrizeDonation(input: {
  name: string;
  description: string;
  email: string;
  noticeAccepted: boolean;
  now?: Date;
}) {
  if (!input.noticeAccepted) throw new Error("请先阅读并同意奖品捐献须知。");
  const now = input.now ?? new Date();
  const donation: StoredPrizeDonation = {
    id: randomUUID(),
    season: seasonForDate(now).code,
    name: input.name,
    description: input.description,
    emailEncrypted: encryptSensitiveText(input.email),
    status: "pending_confirmation",
    createdAt: now.toISOString(),
    confirmedAt: null,
    noticeRevision: PRIZE_NOTICE_REVISION,
    noticeAcceptedAt: now.toISOString(),
  };
  await mutateFrontierStore((store) => { store.prizeDonations.push(donation); });
  return donation;
}

export async function listPublicPrizePool(season = seasonForDate().code): Promise<PublicPrizeDonation[]> {
  const store = await readFrontierStore();
  return store.prizeDonations
    .filter((item): item is StoredPrizeDonation & { status: PublicPrizeDonationStatus } => (
      item.season === season && (item.status === "available" || item.status === "assigned" || item.status === "carried_over")
    ))
    .map(({ id, season: itemSeason, name, description, status }) => ({ id, season: itemSeason, name, description, status }));
}

export type { PublicPrizeDonation, PublicPrizeDonationStatus } from "./model.ts";
