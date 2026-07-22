import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatNumber } from "@/lib/data";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Metadata> {
  const { owner, repo } = await params;
  const content = await getPublicContent();
  const project = content.projects.find((item) => item.owner === owner && item.repo === repo);
  return { title: project ? `${owner}/${repo}` : "SiC 项目" };
}

export default async function ProjectPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const content = await getPublicContent();
  const project = content.projects.find((item) => item.owner === owner && item.repo === repo);
  if (!project) notFound();

  return (
    <article className="detail-page shell project-detail">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/sic">SiC / VELOCITY</Link><span>RANK {String(project.rank).padStart(2, "0")}</span><span>AI 摘要</span></div>
        <p className="project-owner mono">{project.owner}/</p>
        <h1>{project.repo}</h1>
        <p className="detail-lead">{project.description}</p>
      </header>
      <div className="metric-strip">
        <div><span className="mono">24H</span><strong>+{formatNumber(project.delta24)}</strong></div>
        <div><span className="mono">7D</span><strong>+{formatNumber(project.delta7)}</strong></div>
        <div><span className="mono">累计 Star</span><strong>{formatNumber(project.stars)}</strong></div>
        <div><span className="mono">排名变化</span><strong>{project.change}</strong></div>
      </div>
      <div className="detail-layout">
        <div className="detail-body">
          <section><h2>适合解决的问题</h2><p>{project.fit}</p></section>
          <section><h2>项目说明</h2><p>该项目近期增长明显。Vault2077 根据公开仓库描述与 README 快照生成本页摘要，用于帮助超级个体快速判断是否值得进一步阅读，不替代项目官方文档。</p></section>
          <section><h2>阅读建议</h2><p>先检查许可证、最近提交和未解决问题，再根据自身工作流评估接入成本。不要直接执行 README 中来源不明的安装命令。</p></section>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow mono">REPOSITORY</p>
          <p>{project.language}</p>
          <p>{project.license}</p>
          <p>更新 {project.updated}</p>
          <p>抓取 {project.captured}</p>
          <div className="aside-note">
            <a className="text-action" href={`https://github.com/${project.owner}/${project.repo}`} target="_blank" rel="noreferrer">打开 GitHub 仓库</a>
          </div>
        </aside>
      </div>
    </article>
  );
}
