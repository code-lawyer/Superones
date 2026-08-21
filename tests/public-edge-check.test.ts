import assert from "node:assert/strict";
import test from "node:test";
import { checkPublicEdge } from "../scripts/check-public-edge.ts";

const publicOrigin = "https://public.example";
const adminOrigin = "https://admin.example";

function response(status: number, edge = false, server = "nginx", documentCsp = true) {
  const headers: Record<string, string> = {
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    server,
  };
  if (documentCsp) {
    headers["content-security-policy"] = edge
      ? "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      : "default-src 'self'; frame-ancestors 'none'";
  }
  return new Response(null, {
    status,
    headers,
  });
}

function expectedResponse(url: string, method: string) {
  const parsed = new URL(url);
  if (parsed.origin === adminOrigin && parsed.pathname === "/admin" && method === "GET") {
    return response(200);
  }
  if (parsed.origin === publicOrigin && ["/", "/feed", "/opc", "/sic", "/frontier"].includes(parsed.pathname)) {
    return response(200);
  }
  if (parsed.origin === publicOrigin && method === "POST" && parsed.pathname === "/api/opc/esign/callback") {
    return response(404, false, "nginx", false);
  }
  if (parsed.origin === publicOrigin && method === "GET" && ["/admin", "/api/internal/health", "/api/internal/frontier/tick"].includes(parsed.pathname)) {
    return response(404, true);
  }
  if (parsed.origin === publicOrigin && (
    (method === "GET" && parsed.pathname === "/api/internal/acquisition")
    || (method === "POST" && parsed.pathname === "/api/internal/frontier/tasks")
  )) {
    return response(405, true);
  }
  throw new Error(`unexpected probe ${method} ${url}`);
}

function withRepeatedSecurityHeaders(base: Response) {
  const headers = new Headers(base.headers);
  for (const name of ["strict-transport-security", "x-content-type-options", "x-frame-options"]) {
    headers.append(name, base.headers.get(name)!);
  }
  return new Response(null, { status: base.status, headers });
}

test("the public edge probe verifies only read-only public and method-boundary requests", async () => {
  const requests: string[] = [];
  const result = await checkPublicEdge({
    publicOrigin,
    adminOrigin,
    fetcher: async (input, init) => {
      const method = init?.method ?? "GET";
      requests.push(`${method} ${input}`);
      assert.equal(init?.body, undefined);
      assert.equal(init?.headers, undefined);
      return expectedResponse(String(input), method);
    },
  });

  assert.equal(result.checked, 12);
  assert.ok(requests.includes("POST https://public.example/api/opc/esign/callback"));
  assert.ok(requests.includes("GET https://public.example/api/internal/acquisition"));
  assert.ok(requests.includes("POST https://public.example/api/internal/frontier/tasks"));
});

test("the public edge probe accepts repeated security headers when every value is equally strict", async () => {
  const result = await checkPublicEdge({
    publicOrigin,
    adminOrigin,
    fetcher: async (input, init) => withRepeatedSecurityHeaders(
      expectedResponse(String(input), init?.method ?? "GET"),
    ),
  });

  assert.equal(result.checked, 12);
});

test("the public edge probe rejects a permissive value hidden among repeated security headers", async () => {
  for (const [header, value, message] of [
    ["strict-transport-security", "max-age=63072000, max-age=0", /缺少有效的 HSTS max-age/],
    ["x-content-type-options", "nosniff, sniff", /缺少 X-Content-Type-Options/],
    ["x-frame-options", "DENY, SAMEORIGIN", /缺少 X-Frame-Options/],
  ] as const) {
    await assert.rejects(
      checkPublicEdge({
        publicOrigin,
        adminOrigin,
        fetcher: async (input, init) => {
          const base = expectedResponse(String(input), init?.method ?? "GET");
          const headers = new Headers(base.headers);
          headers.set(header, value);
          return new Response(null, { status: base.status, headers });
        },
      }),
      message,
      `${header}: ${value}`,
    );
  }
});

test("the public edge probe rejects a version-bearing Server header", async () => {
  for (const server of ["nginx/1.18.0 (Ubuntu)", "nginx 1.25", "nginx Ubuntu"]) {
    await assert.rejects(
      checkPublicEdge({
        publicOrigin,
        adminOrigin,
        fetcher: async (input, init) => {
          const base = expectedResponse(String(input), init?.method ?? "GET");
          return new Response(null, {
            status: base.status,
            headers: { ...Object.fromEntries(base.headers), server },
          });
        },
      }),
      /Server 响应头泄露版本或操作系统信息/,
      server,
    );
  }
});

test("the public edge probe rejects disabled HSTS", async () => {
  await assert.rejects(
    checkPublicEdge({
      publicOrigin,
      adminOrigin,
      fetcher: async (input, init) => {
        const base = expectedResponse(String(input), init?.method ?? "GET");
        return new Response(null, {
          status: base.status,
          headers: { ...Object.fromEntries(base.headers), "strict-transport-security": "max-age=0" },
        });
      },
    }),
    /缺少有效的 HSTS max-age/,
  );
});

test("the public edge probe rejects CSP none mixed with permissive sources", async () => {
  for (const contentSecurityPolicy of [
    "default-src 'none' https:; frame-ancestors 'none'",
    "default-src 'none'; frame-ancestors 'none' https:",
  ]) {
    await assert.rejects(
      checkPublicEdge({
        publicOrigin,
        adminOrigin,
        fetcher: async (input, init) => {
          const base = expectedResponse(String(input), init?.method ?? "GET");
          return new Response(null, {
            status: base.status,
            headers: { ...Object.fromEntries(base.headers), "content-security-policy": contentSecurityPolicy },
          });
        },
      }),
      /CSP 必须精确使用|边缘 CSP 必须精确使用/,
      contentSecurityPolicy,
    );
  }
});
