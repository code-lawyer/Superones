import type { AdminApiResponse } from "./admin-contract.ts";

export const adminMutationHeaders = {
  "Content-Type": "application/json",
  "X-Vault2077-Admin-Request": "1",
} as const;

function mergedAdminMutationHeaders(input?: HeadersInit) {
  const headers = new Headers(input);
  for (const [name, value] of Object.entries(adminMutationHeaders)) headers.set(name, value);
  return headers;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly reauthenticationUrl?: string;

  constructor(status: number, message: string, code?: string, reauthenticationUrl?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.reauthenticationUrl = reauthenticationUrl;
  }
}

export async function readAdminJson<T extends AdminApiResponse = AdminApiResponse>(response: Response): Promise<T | null> {
  const body = await response.json().catch(() => null) as T | null;
  if (!response.ok) {
    throw new AdminApiError(
      response.status,
      typeof body?.error === "string" ? body.error : "请求暂时无法完成。",
      typeof body?.code === "string" ? body.code : undefined,
      typeof body?.reauthenticationUrl === "string" ? body.reauthenticationUrl : undefined,
    );
  }
  return body;
}

export async function requestAdminJson<T extends AdminApiResponse = AdminApiResponse>(
  input: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(input, {
    ...init,
    cache: "no-store",
    headers: init.body !== undefined && init.body !== null
      ? mergedAdminMutationHeaders(init.headers)
      : init.headers,
  });
  return readAdminJson<T>(response);
}
