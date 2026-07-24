import { NextResponse } from "next/server";
import { currentSeason, latestRankingUpdate, listPublicRankings } from "@/lib/frontier-store";

export const runtime = "nodejs";

export async function GET() {
  const season = currentSeason();
  return NextResponse.json({ season, updatedAt: await latestRankingUpdate(season.code), entries: await listPublicRankings(season.code) });
}
