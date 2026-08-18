import process from "node:process";
import { pathToFileURL } from "node:url";

type EdgeOrigin = "public" | "admin";

type EdgeExpectation = {
  origin: EdgeOrigin;
  path: string;
  method: "GET" | "POST";
  status: number;
  edge?: true;
};

export type EdgeFetcher = (input: string, init?: RequestInit) => Promise<Response>;

const expectations: EdgeExpectation[] = [
  { origin: "public", path: "/", method: "GET", status: 200 },
  { origin: "public", path: "/feed", method: "GET", status: 200 },
  { origin: "public", path: "/opc", method: "GET", status: 200 },
  { origin: "public", path: "/sic", method: "GET", status: 200 },
  { origin: "public", path: "/frontier", method: "GET", status: 200 },
  { origin: "admin", path: "/admin", method: "GET", status: 200 },
  { origin: "public", path: "/admin", method: "GET", status: 404, edge: true },
  { origin: "public", path: "/api/internal/health", method: "GET", status: 404, edge: true },
  { origin: "public", path: "/api/internal/frontier/tick", method: "GET", status: 404, edge: true },
  { origin: "public", path: "/api/internal/acquisition", method: "GET", status: 405, edge: true },
  { origin: "public", path: "/api/internal/frontier/tasks", method: "POST", status: 405, edge: true },
];

function normalizedHttpsOrigin(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/, "")) {
    throw new Error(`${label} 必须是不带路径的 HTTPS origin。`);
  }
  return url.origin;
}

function cspDirective(csp: string, name: string) {
  const directive = csp
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.split(/\s+/, 1)[0]?.toLowerCase() === name.toLowerCase());
  return directive?.split(/\s+/).slice(1) ?? [];
}

function hasOnlyNoneSource(csp: string, directive: string) {
  const sources = cspDirective(csp, directive);
  return sources.length === 1 && sources[0]?.toLowerCase() === "'none'";
}

function hstsMaxAge(policy: string) {
  const directive = policy
    .split(";")
    .map((value) => value.trim())
    .find((value) => /^max-age\s*=/i.test(value));
  if (!directive) return null;
  const match = directive.match(/^max-age\s*=\s*(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function repeatedHeaderValues(header: string) {
  return header.split(",").map((value) => value.trim()).filter(Boolean);
}

function hasOnlyHeaderValue(header: string, expected: string) {
  const values = repeatedHeaderValues(header);
  return values.length > 0 && values.every((value) => value.toLowerCase() === expected.toLowerCase());
}

function hasValidHsts(header: string) {
  const policies = repeatedHeaderValues(header);
  return policies.length > 0 && policies.every((policy) => {
    const maxAge = hstsMaxAge(policy);
    return maxAge !== null && Number.isSafeInteger(maxAge) && maxAge > 0;
  });
}

function assertSecurityHeaders(response: Response, label: string, edge: boolean) {
  const hsts = response.headers.get("strict-transport-security") ?? "";
  if (!hasValidHsts(hsts)) {
    throw new Error(`${label} 缺少有效的 HSTS max-age。`);
  }
  if (!hasOnlyHeaderValue(response.headers.get("x-content-type-options") ?? "", "nosniff")) {
    throw new Error(`${label} 缺少 X-Content-Type-Options: nosniff。`);
  }
  if (!hasOnlyHeaderValue(response.headers.get("x-frame-options") ?? "", "DENY")) {
    throw new Error(`${label} 缺少 X-Frame-Options: DENY。`);
  }
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!hasOnlyNoneSource(csp, "frame-ancestors")) {
    throw new Error(`${label} 的 CSP 必须精确使用 frame-ancestors 'none'。`);
  }
  if (edge && !hasOnlyNoneSource(csp, "default-src")) {
    throw new Error(`${label} 的边缘 CSP 必须精确使用 default-src 'none'。`);
  }

  const server = response.headers.get("server") ?? "";
  if (/\d|\/|\([^)]*\)|\b(?:alpine|centos|debian|linux|rhel|ubuntu|unix|windows)\b/i.test(server)) {
    throw new Error(`${label} 的 Server 响应头泄露版本或操作系统信息。`);
  }
}

export async function checkPublicEdge({
  publicOrigin,
  adminOrigin,
  fetcher = fetch,
}: {
  publicOrigin: string;
  adminOrigin: string;
  fetcher?: EdgeFetcher;
}) {
  const origins: Record<EdgeOrigin, string> = {
    public: normalizedHttpsOrigin(publicOrigin, "公开站 origin"),
    admin: normalizedHttpsOrigin(adminOrigin, "管理站 origin"),
  };
  const results: Array<{ method: string; url: string; status: number }> = [];
  for (const expectation of expectations) {
    const url = `${origins[expectation.origin]}${expectation.path}`;
    const response = await fetcher(url, {
      method: expectation.method,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const label = `${expectation.method} ${url}`;
    if (response.status !== expectation.status) {
      throw new Error(`${label} 预期 ${expectation.status}，实际 ${response.status}。`);
    }
    assertSecurityHeaders(response, label, expectation.edge === true);
    await response.body?.cancel().catch(() => undefined);
    results.push({ method: expectation.method, url, status: response.status });
  }
  return { checked: results.length, results };
}

async function main() {
  const result = await checkPublicEdge({
    publicOrigin: process.env.VAULT2077_PUBLIC_ORIGIN ?? "https://superones.top",
    adminOrigin: process.env.VAULT2077_ADMIN_ORIGIN ?? "https://admin.superones.top",
  });
  console.log(JSON.stringify({ status: "ok", checked: result.checked }, null, 2));
}

const isMain = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
