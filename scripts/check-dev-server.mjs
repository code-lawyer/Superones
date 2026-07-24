const baseUrl = process.env.VAULT2077_DEV_URL ?? "http://127.0.0.1:3017/";

const pageResponse = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
if (!pageResponse.ok) throw new Error(`首页返回 HTTP ${pageResponse.status}。`);
const html = await pageResponse.text();
const assets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value.startsWith("/_next/"));
if (assets.length === 0) throw new Error("首页没有找到 Next.js 资源引用。");

const failures = [];
for (const asset of [...new Set(assets)]) {
  const response = await fetch(new URL(asset, baseUrl), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) failures.push(`${asset} => HTTP ${response.status}`);
}
if (failures.length > 0) throw new Error(`资源检查失败：${failures.join("；")}`);
console.log(`开发服务器检查通过：首页 ${pageResponse.status}，资源 ${new Set(assets).size} 个全部可用。`);
