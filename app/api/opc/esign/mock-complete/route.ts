import { NextRequest, NextResponse } from "next/server";
import { completeMockOpcSignature } from "@/lib/opc-order-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  if (request.headers.get("x-vault2077-public-request") !== "1") return NextResponse.json({ error: "请求无效。" }, { status: 403 });
  try {
    const body = await request.json() as { order?: unknown; token?: unknown };
    const order = typeof body.order === "string" ? body.order : "";
    const token = typeof body.token === "string" ? body.token : "";
    return NextResponse.json({ order: await completeMockOpcSignature(order, token) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模拟签署失败。" }, { status: 400 });
  }
}
