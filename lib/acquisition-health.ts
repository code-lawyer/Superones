import type { AcquisitionLane } from "./acquisition-contract.ts";
import { ACQUISITION_SCHEDULES, type AcquisitionLaneSchedule } from "./acquisition-schedule.ts";

type LaneFreshnessInput = {
  lane: AcquisitionLane;
  lastSuccessfulAt: string | null;
  now?: Date;
};

export type AcquisitionInboxHealthInput = {
  counts: {
    received: number;
    processing: number;
    processed: number;
    retryable: number;
    quarantined: number;
  };
  oldestReceivedAt: string | null;
  oldestProcessingAt: string | null;
  oldestRetryableAt: string | null;
  latestQuarantine: {
    batchId: string;
    lane: AcquisitionLane;
    at: string;
  } | null;
};

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;
const NEW_QUARANTINE_WINDOW_MINUTES = 30;

function beijingDayStart(value: Date) {
  const shifted = new Date(value.getTime() + BEIJING_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - BEIJING_OFFSET_MS;
}

function latestExpectedAt(now: Date, schedule: AcquisitionLaneSchedule) {
  const today = beijingDayStart(now);
  const candidates = [-1, 0].flatMap((dayOffset) => schedule.beijingMinutes.map((minute) => (
    today + dayOffset * 24 * 60 * 60 * 1_000 + minute * 60 * 1_000
  )));
  const nowMs = now.getTime();
  const graceMs = schedule.graceMinutes * 60 * 1_000;
  return candidates.filter((scheduledAt) => scheduledAt + graceMs <= nowMs).sort((left, right) => right - left)[0];
}

export function acquisitionLaneFreshness(input: LaneFreshnessInput) {
  const now = input.now ?? new Date();
  const schedule = ACQUISITION_SCHEDULES[input.lane];
  const expectedAtMs = latestExpectedAt(now, schedule);
  const lastSuccessfulMs = input.lastSuccessfulAt ? Date.parse(input.lastSuccessfulAt) : Number.NaN;
  const status = Number.isFinite(lastSuccessfulMs) && lastSuccessfulMs >= expectedAtMs ? "ok" : "degraded";
  const expectedAt = new Date(expectedAtMs).toISOString();
  return {
    status,
    expectedAt,
    lastSuccessfulAt: input.lastSuccessfulAt,
    detail: `last=${input.lastSuccessfulAt ?? "none"}; expected>=${expectedAt}; grace=${schedule.graceMinutes}m`,
  } as const;
}

function ageMinutes(value: string | null, now: Date) {
  if (!value) return null;
  const age = (now.getTime() - Date.parse(value)) / 60_000;
  return Number.isFinite(age) ? Math.max(0, age) : Number.POSITIVE_INFINITY;
}

export function acquisitionInboxHealth(input: AcquisitionInboxHealthInput, now = new Date()) {
  const receivedAge = ageMinutes(input.oldestReceivedAt, now);
  const processingAge = ageMinutes(input.oldestProcessingAt, now);
  const retryableAge = ageMinutes(input.oldestRetryableAt, now);
  const quarantineAge = ageMinutes(input.latestQuarantine?.at ?? null, now);
  const hasNewQuarantine = quarantineAge !== null && quarantineAge <= NEW_QUARANTINE_WINDOW_MINUTES;
  const degraded = hasNewQuarantine
    || input.counts.received > 20
    || input.counts.processing > 2
    || input.counts.retryable > 20
    || (receivedAge !== null && receivedAge > 10)
    || (processingAge !== null && processingAge > 20)
    || (retryableAge !== null && retryableAge > 6 * 60);
  return {
    status: degraded ? "degraded" : "ok",
    detail: [
      `received=${input.counts.received}`,
      `processing=${input.counts.processing}`,
      `retryable=${input.counts.retryable}`,
      `quarantined=${input.counts.quarantined}`,
      `oldestReceived=${receivedAge === null ? "none" : `${receivedAge.toFixed(1)}m`}`,
      `oldestProcessing=${processingAge === null ? "none" : `${processingAge.toFixed(1)}m`}`,
      `oldestRetryable=${retryableAge === null ? "none" : `${retryableAge.toFixed(1)}m`}`,
      `latestQuarantine=${input.latestQuarantine ? `${input.latestQuarantine.batchId}/${input.latestQuarantine.lane}/${quarantineAge?.toFixed(1) ?? "invalid"}m` : "none"}`,
    ].join("; "),
  } as const;
}
