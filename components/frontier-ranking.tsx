import { formatNumber } from "@/lib/data";
import type { FrontierEntry } from "@/lib/types";

export function FrontierRanking({
  items,
  emptyMessage = "本赛季尚无通过验证的项目。提交第一个公开仓库。",
  variant = "table",
}: {
  items: FrontierEntry[];
  emptyMessage?: string;
  variant?: "table" | "feature";
}) {
  return (
    <div className={`record-list frontier-list frontier-list--${variant}`}>
      <div className="record-head frontier-head mono" aria-hidden="true">
        <span>排名</span>
        <span>仓库</span>
        <span>基线</span>
        <span>当前</span>
        <span>净新增</span>
      </div>
      {items.length === 0 ? (
        <div className="frontier-ranking-empty">
          <span className="mono" aria-hidden="true">00</span>
          <p>{emptyMessage}</p>
        </div>
      ) : null}
      {items.map((entry) => (
        <article className="record-row frontier-row" key={entry.repo}>
          <strong className="frontier-rank mono">{String(entry.rank).padStart(2, "0")}</strong>
          <div className="record-main">
            <h3><span>{entry.repo}</span></h3>
            <p>{entry.description}</p>
            <p className="mono muted">通过验证 {entry.submitted}</p>
          </div>
          <span className="trend-value mono">{formatNumber(entry.baseline)}</span>
          <span className="trend-value mono">{formatNumber(entry.current)}</span>
          <strong className="trend-value trend-value--hot mono">{entry.delta > 0 ? "+" : ""}{formatNumber(entry.delta)}</strong>
        </article>
      ))}
    </div>
  );
}
