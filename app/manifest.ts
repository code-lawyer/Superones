import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vault2077",
    short_name: "Vault2077",
    description: "为超级个体提供持续情报、标准化经营服务、技术趋势与开放实验场。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#111111",
    lang: "zh-CN",
  };
}
