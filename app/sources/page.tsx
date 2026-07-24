import type { Metadata } from "next";
import { SourceCatalogExplorer } from "@/app/sources/source-catalog-explorer";
import { getSourceCatalog } from "@/lib/source-catalog";

export const metadata: Metadata = {
  title: "数据源地图",
  description: "Vault2077 清理后的运行来源，以及资讯瀑布、名人说、SiC 内容和生态榜单的根源与传输路径。",
};

export default function SourcesPage() {
  return <SourceCatalogExplorer catalog={getSourceCatalog()} />;
}
