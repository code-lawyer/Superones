import type { Metadata } from "next";
import { SourceCatalogExplorer } from "@/app/sources/source-catalog-explorer";
import { getSourceCatalog } from "@/lib/source-catalog";

export const metadata: Metadata = {
  title: "数据源地图",
  description: "Vault2077 当前公开内容所使用的资讯瀑布、路边社、播客、论文、档案、课程与生态榜单来源。",
};

export default function SourcesPage() {
  return <SourceCatalogExplorer catalog={getSourceCatalog()} />;
}
