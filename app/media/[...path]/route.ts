import { NextResponse } from "next/server";
import { isRangerAvatarObjectKey } from "@/lib/ranger-avatar";
import { readLocalRangerMediaObject } from "@/lib/ranger-avatar-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const key = (await params).path.join("/");
  if (!isRangerAvatarObjectKey(key)) return new NextResponse(null, { status: 404 });
  try {
    const contents = await readLocalRangerMediaObject(key);
    return new NextResponse(new Uint8Array(contents), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
