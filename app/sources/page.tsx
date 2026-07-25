import type { Metadata } from "next";
import { SourceCatalogExplorer } from "@/app/sources/source-catalog-explorer";
import { getSourceCatalog } from "@/lib/source-catalog";

export const metadata: Metadata = {
  title: "数据源地图",
  description: "Vault2077 清理后的资讯瀑布、路边社、播客、论文、文档、课程与生态榜单来源及传输路径。",
};

export default function SourcesPage() {
  return <SourceCatalogExplorer catalog={getSourceCatalog()} />;
}
