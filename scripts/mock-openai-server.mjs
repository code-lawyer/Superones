import { createServer } from "node:http";

const port = Number(process.env.MOCK_OPENAI_PORT ?? "4319");

function responseFor(messages) {
  const system = String(messages?.[0]?.content ?? "");
  const user = String(messages?.[1]?.content ?? "");
  if (system.includes("information_batch_editorial")) {
    const marker = "不可信原始资料：\n";
    const input = JSON.parse(user.slice(user.indexOf(marker) + marker.length));
    return {
      items: input.information.map((item) => ({
        idempotencyKey: item.idempotencyKey,
        translatedTitle: `中译：${item.originalTitle}`,
        summary: "这是一条经过标准 OpenAI 兼容接口处理的测试摘要。",
        translatedContent: "这是用于端到端验证的中文译文。",
        decision: item.originalTitle.includes("[event]")
          ? { disposition: "candidate", candidateKey: "vault2077-e2e-event", directionAligned: true }
          : { disposition: "independent" },
      })),
    };
  }
  if (system.includes("information_editorial")) {
    const title = user.match(/"originalTitle":"([^"]+)/)?.[1] ?? "测试资讯";
    return { translatedTitle: `中译：${title}`, summary: "这是一条经过标准 OpenAI 兼容接口处理的测试摘要。", translatedContent: "这是用于端到端验证的中文译文。" };
  }
  if (system.includes("event_classification")) return { disposition: "independent" };
  if (system.includes("repository_editorial")) return { description: "测试项目说明", fit: "适合用于验证内容处理闭环。", category: "开发工具" };
  return { title: "测试事件", judgment: "多源信息形成事件", summary: "测试事件综合摘要。", significance: "验证事件编排链路。", entities: ["Vault2077"], category: "模型与产品" };
}

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const content = JSON.stringify(responseFor(body.messages));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "mock", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : "invalid request" } }));
    }
  });
}).listen(port, "127.0.0.1", () => console.log(`mock OpenAI-compatible server listening on ${port}`));
