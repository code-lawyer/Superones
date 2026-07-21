import { NextResponse } from "next/server";
import { CURRENT_SEASON, listPublicRankings } from "@/lib/frontier-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ season: CURRENT_SEASON, entries: await listPublicRankings() });
}
