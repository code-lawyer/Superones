export function cleanStatementText(value: string) {
  const markers = [
    "🔗 View on Twitter",
    "🔗 View Quoted Tweet",
    "Your browser does not support the video tag.",
    "你的浏览器不支持视频标签。",
    "您的浏览器不支持视频标签。",
    "⚡ Powered by xgo.ing",
  ];
  const positions = markers
    .map((marker) => value.indexOf(marker))
    .filter((position) => position >= 0);
  const metricPosition = value.search(/[💬🔄👀📊]\s*\d/u);
  if (metricPosition >= 0) positions.push(metricPosition);
  return (positions.length > 0 ? value.slice(0, Math.min(...positions)) : value).trim();
}
