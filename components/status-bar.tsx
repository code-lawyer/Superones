import { siteStatus } from "@/lib/data";
import type { ContentState } from "@/lib/types";

export function StatusBar({ state, demo }: { state?: ContentState; demo?: boolean }) {
  const isDemo = demo ?? state?.mode !== "live";
  const updated = state?.updatedAt ? new Date(state.updatedAt).toLocaleString("zh-CN", { hour12: false }) : siteStatus.updated;
  const sourceCount = state?.sourceCount ?? siteStatus.sources;
  return (
    <div className="status-bar" aria-label="系统状态">
      <div className="shell status-bar__inner mono">
        <span className="status-live">SYSTEM / LIVE</span>
        <span className="status-item"><span className="status-label">修订</span>{updated}</span>
        <span className="status-item"><span className="status-label">来源</span>{sourceCount}</span>
        <span className="status-item"><span className="status-label">赛季</span>{siteStatus.season} / {siteStatus.seasonState}</span>
        {isDemo ? <span className="status-demo">DEMO DATA / 示例数据</span> : <span className="status-demo">PUBLIC SOURCES / 自动更新</span>}
      </div>
    </div>
  );
}
