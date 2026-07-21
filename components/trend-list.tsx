import Link from "next/link";
import { formatNumber } from "@/lib/data";
import type { TrendProject } from "@/lib/types";

export function TrendList({ items }: { items: TrendProject[] }) {
  return (
    <div className="record-list trend-list">
      <div className="record-head trend-head mono" aria-hidden="true">
        <span>排名</span>
        <span>项目</span>
        <span>24H</span>
        <span>7D</span>
        <span>累计</span>
      </div>
      {items.map((project) => (
        <article className="record-row trend-row" key={`${project.owner}/${project.repo}`}>
          <div className="trend-rank mono"><strong>{String(project.rank).padStart(2, "0")}</strong><span>{project.change}</span></div>
          <div className="record-main">
            <p className="mono project-path">{project.owner}/{project.repo}</p>
            <h3><Link href={`/sic/${project.owner}/${project.repo}`}>{project.description}</Link></h3>
            <p className="mono muted">{project.category} / {project.language} / {project.license}</p>
          </div>
          <strong className="trend-value trend-value--hot mono">+{formatNumber(project.delta24)}</strong>
          <strong className="trend-value mono">+{formatNumber(project.delta7)}</strong>
          <span className="trend-value mono">{formatNumber(project.stars)}</span>
        </article>
      ))}
    </div>
  );
}
