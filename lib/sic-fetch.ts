import "server-only";

type BoundedFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

async function readBoundedStream(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: number,
  maxBytes: number,
) {
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`上游响应超过 ${maxBytes} 字节限制。`);
  }
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`上游响应超过 ${maxBytes} 字节限制。`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readBoundedBody(response: Response, maxBytes: number) {
  return readBoundedStream(
    response.body,
    Number(response.headers.get("content-length")),
    maxBytes,
  );
}

export async function readJsonRequestBounded<T>(request: Request, maxBytes: number): Promise<T> {
  const source = await readBoundedStream(
    request.body,
    Number(request.headers.get("content-length")),
    maxBytes,
  );
  try {
    return JSON.parse(source) as T;
  } catch {
    throw new Error("请求体不是有效 JSON。");
  }
}

export async function fetchTextBounded(
  url: string,
  init: RequestInit = {},
  options: BoundedFetchOptions = {},
) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(url, {
        ...init,
        signal: controller.signal,
        cache: init.cache ?? "no-store",
      });
    } catch (error) {
      const cause = error && typeof error === "object" && "cause" in error
        ? error.cause
        : undefined;
      const code = cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "";
      const detail = cause instanceof Error
        ? cause.message
        : error instanceof Error
          ? error.message
          : String(error);
      const host = new URL(url).hostname;
      if (controller.signal.aborted) {
        throw new Error(`${host} 请求在 ${timeoutMs}ms 后超时。`, { cause: error });
      }
      throw new Error(
        `${host} 网络请求失败${code ? `（${code}）` : ""}：${detail.slice(0, 240)}`,
        { cause: error },
      );
    }
    if (!response.ok) throw new Error(`${new URL(url).hostname} 返回 HTTP ${response.status}。`);
    return {
      response,
      text: await readBoundedBody(response, options.maxBytes ?? DEFAULT_MAX_BYTES),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonBounded<T>(
  url: string,
  init: RequestInit = {},
  options: BoundedFetchOptions = {},
): Promise<{ response: Response; data: T }> {
  const result = await fetchTextBounded(url, init, options);
  try {
    return { response: result.response, data: JSON.parse(result.text) as T };
  } catch {
    throw new Error(`${new URL(url).hostname} 返回了无效 JSON。`);
  }
}
