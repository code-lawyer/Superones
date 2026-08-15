import { createSicPublicPaginationHandler } from "@/lib/sic-public-pagination-handler";
import { getPublicSicSnapshot } from "@/lib/sic-public-snapshot";

export const runtime = "nodejs";
export const GET = createSicPublicPaginationHandler(getPublicSicSnapshot);
