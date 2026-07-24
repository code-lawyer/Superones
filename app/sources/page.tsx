import type { Metadata } from "next";
import { SourceCatalogExplorer } from "@/app/sources/source-catalog-explorer";
import { getSourceCatalog } from "@/lib/source-catalog";

export const metadata: Metadata = {
  title: "数据源地图",
  description: "Vault2077 统一采集管线的全部运行来源、用途、性质与展示位置。",
};

export default function SourcesPage() {
  return <SourceCatalogExplorer catalog={getSourceCatalog()} />;
}
