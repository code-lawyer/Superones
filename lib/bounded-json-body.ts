export async function readBoundedTextBody(
  request: Request,
  maximumBytes: number,
  tooLargeMessage = "请求内容超过大小限制。",
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new RangeError("请求体大小限制配置无效。");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError(tooLargeMessage);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJsonBody(request: Request, maximumBytes: number) {
  let raw: string;
  try {
    raw = await readBoundedTextBody(request, maximumBytes, "订单内容超过大小限制。");
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new SyntaxError("订单内容不是有效 JSON。");
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SyntaxError("订单内容不是有效 JSON。");
  }
}
