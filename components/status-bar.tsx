import { siteStatus } from "@/lib/data";

export function StatusBar({ demo = true }: { demo?: boolean }) {
  return (
    <div className="status-bar" aria-label="系统状态">
      <div className="shell status-bar__inner mono">
        <span className="status-live">LIVE</span>
        <span>更新 {siteStatus.updated}</span>
        <span>来源 {siteStatus.sources}</span>
        <span>{siteStatus.season} / {siteStatus.seasonState}</span>
        {demo ? <span className="status-demo">DEMO DATA / 示例数据</span> : null}
      </div>
    </div>
  );
}
