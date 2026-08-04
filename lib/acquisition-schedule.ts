import type { AcquisitionLane } from "./acquisition-contract.ts";

export type AcquisitionLaneSchedule = Readonly<{
  cron: string;
  beijingMinutes: readonly number[];
  graceMinutes: number;
}>;

export const ACQUISITION_SCHEDULES = {
  information: {
    cron: "5 0,2,4,6,8,10,12,14 * * *",
    beijingMinutes: Array.from({ length: 8 }, (_, index) => (8 + index * 2) * 60 + 5),
    graceMinutes: 90,
  },
  roadside: {
    cron: "55 0,2,4,6,8,10,12,14 * * *",
    beijingMinutes: Array.from({ length: 8 }, (_, index) => (8 + index * 2) * 60 + 55),
    graceMinutes: 90,
  },
  sic: {
    cron: "25 0 * * *",
    beijingMinutes: [8 * 60 + 25],
    graceMinutes: 180,
  },
  rankings: {
    cron: "35 0,4,8,12 * * *",
    beijingMinutes: [8 * 60 + 35, 12 * 60 + 35, 16 * 60 + 35, 20 * 60 + 35],
    graceMinutes: 90,
  },
} satisfies Record<AcquisitionLane, AcquisitionLaneSchedule>;
