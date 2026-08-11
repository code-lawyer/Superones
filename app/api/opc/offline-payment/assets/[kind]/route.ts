import { readPublishedOpcOfflinePaymentAsset } from "../../../../../../lib/opc-offline-payment-profile.ts";

export const runtime = "nodejs";

async function respond(
  request: Request,
  context: { params: Promise<{ kind: string }> },
  includeBody: boolean,
) {
  const { kind } = await context.params;
  if (kind !== "agreement" && kind !== "contact-qr") {
    return new Response(null, { status: 404 });
  }
  const asset = await readPublishedOpcOfflinePaymentAsset(kind);
  if (!asset) return new Response(null, { status: 404 });
  const searchParams = new URL(request.url).searchParams;
  const requestedRevision = searchParams.get("revision") ?? "";
  const requestedSha256 = searchParams.get("v")?.toLowerCase() ?? "";
  if (
    requestedRevision !== asset.revision
    || !/^[a-f0-9]{64}$/.test(requestedSha256)
    || requestedSha256 !== asset.sha256
  ) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const disposition = kind === "agreement" ? "attachment" : "inline";
  const asciiName = kind === "agreement" ? "OPC-service-agreement.pdf" : `OPC-contact-qr.${asset.mediaType.split("/")[1]}`;
  return new Response(includeBody ? new Uint8Array(asset.bytes) : null, {
    headers: {
      "Content-Type": asset.mediaType,
      "Content-Length": String(asset.bytes.length),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      "Cache-Control": "public, max-age=300, must-revalidate",
      "ETag": `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  return respond(request, context, true);
}

export function HEAD(request: Request, context: { params: Promise<{ kind: string }> }) {
  return respond(request, context, false);
}
